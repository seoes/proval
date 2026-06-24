import type { Repository, RepositoryResponse, RepositoryInsert, RepositoryUpdateInput } from "@proval/types";
import db from "../../db/index.js";
import {
    activityTable,
    githubAppTable,
    githubInstallationTable,
    gitProviderAccessTable,
    repositoryTable,
} from "@proval/db";
import { desc, eq, getTableColumns, max } from "drizzle-orm";
import { App } from "@octokit/app";
import { Octokit } from "@octokit/rest";
import { generateUnusedRepositoryWebhookSecret } from "../../util/webhook-secret.js";
import { GitLabAccessService } from "../access/access.service.js";
import { ForgejoProvider } from "../../git-provider/forgejo.js";
import { GitHubProvider } from "../../git-provider/github.js";
import { GitLabProvider } from "../../git-provider/gitlab.js";
import type { GitProvider } from "../../git-provider/types.js";
import { logError } from "../../util/log.js";

const accessService = new GitLabAccessService();

export class RepositoryService {
    public async findAll(): Promise<RepositoryResponse[]> {
        const repositoryList = await db
            .select({
                ...getTableColumns(repositoryTable),
                lastUsedAt: max(activityTable.createdAt).as("last_used_at"),
            })
            .from(repositoryTable)
            .leftJoin(activityTable, eq(repositoryTable.id, activityTable.repositoryId))
            .groupBy(repositoryTable.id)
            .orderBy(desc(max(activityTable.createdAt)));
        return repositoryList.map((repository) => this.toResponse(repository, repository.lastUsedAt));
    }

    public async findById(repositoryId: number): Promise<RepositoryResponse> {
        const [repository] = await db
            .select({
                ...getTableColumns(repositoryTable),
                lastUsedAt: max(activityTable.createdAt).as("last_used_at"),
            })
            .from(repositoryTable)
            .leftJoin(activityTable, eq(repositoryTable.id, activityTable.repositoryId))
            .groupBy(repositoryTable.id)
            .where(eq(repositoryTable.id, repositoryId));
        if (!repository) {
            throw new Error("Repository not found");
        }
        return this.toResponse(repository, repository.lastUsedAt);
    }

    public async getGitLabProjectAccessToken(
        repositoryId: number,
    ): Promise<{ accessToken: string; accessTokenId: number }> {
        const [{ accessToken, accessTokenId }] = await db
            .select({ accessToken: repositoryTable.accessToken, accessTokenId: repositoryTable.accessTokenId })
            .from(repositoryTable)
            .where(eq(repositoryTable.id, repositoryId));

        if (!accessToken || !accessTokenId) {
            throw new Error("Repository not found");
        }

        return { accessToken, accessTokenId };
    }

    public async create(data: RepositoryInsert): Promise<RepositoryResponse> {
        const isGitHub = data.provider === "github";
        const isWebhookSecretEmpty =
            data.webhookSecret === undefined || data.webhookSecret === null || data.webhookSecret.trim() === "";
        const values =
            isGitHub && isWebhookSecretEmpty
                ? { ...data, webhookSecret: generateUnusedRepositoryWebhookSecret() }
                : data;
        if (data.provider === "gitlab") {
            if (!data.gitProviderAccessId || !data.gitProviderRepositoryId) {
                throw new Error("GitLab access ID and repository ID are required");
            }
            values.accessToken = null;
            values.accessTokenId = null;

            const access = await accessService.findById(data.gitProviderAccessId);
            const personalAccessToken = await accessService.getAccessToken(data.gitProviderAccessId);

            const [row] = await db.insert(repositoryTable).values(values).returning();
            let projectAccessToken: { token: string; tokenId: number } | undefined;

            try {
                projectAccessToken = await GitLabProvider.createProjectAccessToken(
                    access.baseUrl,
                    personalAccessToken,
                    data.gitProviderRepositoryId,
                );
                const [updated] = await db
                    .update(repositoryTable)
                    .set({
                        accessToken: projectAccessToken.token,
                        accessTokenId: projectAccessToken.tokenId,
                    })
                    .where(eq(repositoryTable.id, row.id))
                    .returning();
                return this.toResponse(updated, null);
            } catch (error) {
                if (projectAccessToken) {
                    try {
                        await GitLabProvider.removeProjectAccessToken(
                            access.baseUrl,
                            personalAccessToken,
                            data.gitProviderRepositoryId,
                            projectAccessToken.tokenId,
                        );
                    } catch (revokeError) {
                        logError("Failed to remove GitLab project access token after create failure", revokeError);
                    }
                }
                await db.delete(repositoryTable).where(eq(repositoryTable.id, row.id));
                throw error;
            }
        }

        values.accessToken = null;
        values.accessTokenId = null;
        const result = await db.insert(repositoryTable).values(values).returning();
        return this.toResponse(result[0], null);
    }

    public async update(repositoryId: number, data: RepositoryUpdateInput): Promise<RepositoryResponse> {
        const cleanData = this.removeUndefined(data);
        let gitLabRevokeAfterUpdate: {
            baseUrl: string;
            personalAccessToken: string;
            projectId: number;
            tokenId: number;
        } | null = null;
        let gitLabNewProjectAccessToken: {
            baseUrl: string;
            personalAccessToken: string;
            projectId: number;
            tokenId: number;
        } | null = null;

        if (data.provider === "gitlab" && cleanData.gitProviderRepositoryId && cleanData.gitProviderAccessId) {
            const access = await accessService.findById(cleanData.gitProviderAccessId);
            const personalAccessToken = await accessService.getAccessToken(cleanData.gitProviderAccessId);

            const [existing] = await db
                .select({
                    gitProviderRepositoryId: repositoryTable.gitProviderRepositoryId,
                    accessTokenId: repositoryTable.accessTokenId,
                })
                .from(repositoryTable)
                .where(eq(repositoryTable.id, repositoryId));

            if (existing?.accessTokenId && existing.gitProviderRepositoryId) {
                gitLabRevokeAfterUpdate = {
                    baseUrl: access.baseUrl,
                    personalAccessToken,
                    projectId: existing.gitProviderRepositoryId,
                    tokenId: existing.accessTokenId,
                };
            }

            const { token, tokenId } = await GitLabProvider.createProjectAccessToken(
                access.baseUrl,
                personalAccessToken,
                cleanData.gitProviderRepositoryId,
            );
            cleanData.accessToken = token;
            cleanData.accessTokenId = tokenId;
            gitLabNewProjectAccessToken = {
                baseUrl: access.baseUrl,
                personalAccessToken,
                projectId: cleanData.gitProviderRepositoryId,
                tokenId,
            };
        }

        let result: Repository[];
        try {
            result = await db
                .update(repositoryTable)
                .set(cleanData)
                .where(eq(repositoryTable.id, repositoryId))
                .returning();
        } catch (error) {
            if (gitLabNewProjectAccessToken) {
                try {
                    await GitLabProvider.removeProjectAccessToken(
                        gitLabNewProjectAccessToken.baseUrl,
                        gitLabNewProjectAccessToken.personalAccessToken,
                        gitLabNewProjectAccessToken.projectId,
                        gitLabNewProjectAccessToken.tokenId,
                    );
                } catch (revokeError) {
                    logError(
                        "Failed to remove new GitLab project access token after repository update failure",
                        revokeError,
                    );
                }
            }
            throw error;
        }

        if (result.length === 0) {
            if (gitLabNewProjectAccessToken) {
                try {
                    await GitLabProvider.removeProjectAccessToken(
                        gitLabNewProjectAccessToken.baseUrl,
                        gitLabNewProjectAccessToken.personalAccessToken,
                        gitLabNewProjectAccessToken.projectId,
                        gitLabNewProjectAccessToken.tokenId,
                    );
                } catch (revokeError) {
                    logError(
                        "Failed to remove new GitLab project access token after repository update failure",
                        revokeError,
                    );
                }
            }
            throw new Error("Repository not found");
        }

        if (gitLabRevokeAfterUpdate) {
            try {
                await GitLabProvider.removeProjectAccessToken(
                    gitLabRevokeAfterUpdate.baseUrl,
                    gitLabRevokeAfterUpdate.personalAccessToken,
                    gitLabRevokeAfterUpdate.projectId,
                    gitLabRevokeAfterUpdate.tokenId,
                );
            } catch (error) {
                logError("Failed to remove old GitLab project access token after repository update", error);
            }
        }
        const lastUsedAt = await db
            .select({ lastUsedAt: max(activityTable.createdAt) })
            .from(activityTable)
            .where(eq(activityTable.repositoryId, repositoryId))
            .limit(1);
        return this.toResponse(result[0], lastUsedAt[0].lastUsedAt ?? null);
    }

    public async updateWebhookSecret(repositoryId: number, webhookSecret: string): Promise<void> {
        await db.update(repositoryTable).set({ webhookSecret }).where(eq(repositoryTable.id, repositoryId));
    }

    public async updatePath(repositoryId: number, path: string): Promise<RepositoryResponse> {
        const trimmed = path.trim();
        if (!trimmed) {
            throw new Error("Repository path cannot be empty");
        }
        const result = await db
            .update(repositoryTable)
            .set({ path: trimmed })
            .where(eq(repositoryTable.id, repositoryId))
            .returning();
        if (result.length === 0) {
            throw new Error("Repository not found");
        }
        const lastUsedAt = await db
            .select({ lastUsedAt: max(activityTable.createdAt) })
            .from(activityTable)
            .where(eq(activityTable.repositoryId, repositoryId))
            .limit(1);
        return this.toResponse(result[0], lastUsedAt[0].lastUsedAt);
    }

    // public async getGitLabProjectAccessToken(repositoryId: number): Promise<string> {
    //     const repository = await this.findById(repositoryId);
    //     if (repository.provider !== "gitlab") {
    //         throw new Error("Repository is not a GitLab repository");
    //     }
    //     if (repository.gitProviderAccessId == null || repository.gitProviderRepositoryId == null) {
    //         throw new Error("GitLab repository is missing access or project id");
    //     }

    // }

    public async refreshPathFromGitProvider(repositoryId: number): Promise<string> {
        const repository = await this.findById(repositoryId);

        let gitProvider: GitProvider;
        if (repository.provider === "gitlab") {
            if (repository.gitProviderAccessId == null || repository.gitProviderRepositoryId == null) {
                throw new Error("GitLab repository is missing access or project id");
            }
            const [{ accessToken }] = await db
                .select({ accessToken: repositoryTable.accessToken, accessTokenId: repositoryTable.accessTokenId })
                .from(repositoryTable)
                .where(eq(repositoryTable.id, repositoryId));
            if (!accessToken) {
                throw new Error("GitLab repository is missing access token");
            }
            const access = await accessService.findById(repository.gitProviderAccessId);
            gitProvider = new GitLabProvider(access.baseUrl, accessToken, repository.gitProviderRepositoryId);
        } else if (repository.provider === "forgejo") {
            if (repository.gitProviderAccessId == null || repository.gitProviderRepositoryId == null) {
                throw new Error("Forgejo repository is missing access or repository id");
            }
            const access = await accessService.findById(repository.gitProviderAccessId);
            const token = await accessService.getAccessToken(repository.gitProviderAccessId);
            gitProvider = new ForgejoProvider(access.baseUrl, token, "", "", repository.gitProviderRepositoryId);
        } else if (repository.provider === "github") {
            if (repository.githubInstallationId == null || repository.githubRepositoryId == null) {
                throw new Error("GitHub repository is missing installation or repository id");
            }

            const row = await db
                .select({
                    app: githubAppTable,
                    installation: githubInstallationTable,
                })
                .from(githubInstallationTable)
                .innerJoin(githubAppTable, eq(githubInstallationTable.appId, githubAppTable.id))
                .where(eq(githubInstallationTable.id, repository.githubInstallationId))
                .limit(1);

            if (row.length === 0) {
                throw new Error("GitHub installation not found");
            }

            const { app, installation } = row[0];
            const githubApp = new App({
                appId: app.appId,
                privateKey: app.privateKey,
                Octokit,
            });
            const octokit = await githubApp.getInstallationOctokit(installation.installationId);
            if (!octokit) {
                throw new Error("Failed to get installation octokit");
            }

            const { data: repo } = await octokit.request("GET /repositories/:repository_id", {
                repository_id: repository.githubRepositoryId,
            });

            gitProvider = new GitHubProvider(octokit, repo.owner.login, repo.name, `${app.slug}[bot]`);
        } else {
            throw new Error(`Unsupported repository provider: ${repository.provider}`);
        }

        const path = await gitProvider.fetchRepositoryPath();
        const updated = await this.updatePath(repositoryId, path);
        return updated.path;
    }

    public toResponse(repository: Repository, lastUsedAt: Date | null): RepositoryResponse {
        const {
            webhookSecret: _webhookSecret,
            accessToken: _accessToken,
            accessTokenId: _accessTokenId,
            ...rest
        } = repository;
        return { ...rest, lastUsedAt };
    }

    public async remove(id: number): Promise<void> {
        const respository = await this.findById(id);
        if (respository.provider === "gitlab") {
            try {
                const [{ personalAccessToken, projectAccessTokenId, gitlabRepositoryId, baseUrl }] = await db
                    .select({
                        personalAccessToken: gitProviderAccessTable.accessToken,
                        projectAccessTokenId: repositoryTable.accessTokenId,
                        gitlabRepositoryId: repositoryTable.gitProviderRepositoryId,
                        baseUrl: gitProviderAccessTable.baseUrl,
                    })
                    .from(gitProviderAccessTable)
                    .innerJoin(repositoryTable, eq(gitProviderAccessTable.id, repositoryTable.gitProviderAccessId))
                    .where(eq(repositoryTable.id, id));
                if (!personalAccessToken || !projectAccessTokenId || !gitlabRepositoryId || !baseUrl) {
                    throw new Error("GitLab repository is missing access or project id");
                }

                await GitLabProvider.removeProjectAccessToken(
                    baseUrl,
                    personalAccessToken,
                    gitlabRepositoryId,
                    projectAccessTokenId,
                );
            } catch (error) {
                logError("Failed to remove GitLab project access token", error);
            }
        }
        await db.delete(repositoryTable).where(eq(repositoryTable.id, id));
    }

    private removeUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
        return Object.fromEntries(Object.entries(obj).filter(([_, v]) => v !== undefined)) as Partial<T>;
    }
}
