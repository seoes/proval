import db from "../../db/index.js";
import { activityTable, githubAppTable, githubInstallationTable, repositoryTable } from "@proval/db";
import { desc, eq, getTableColumns, max } from "drizzle-orm";
import { App } from "@octokit/app";
import { Octokit } from "@octokit/rest";
import {
    normalizeWebhookSecret,
    normalizeWebhookSigningToken,
    WebhookCredentialError,
} from "../../util/webhook-secret.js";
import { GitLabAccessService } from "../access/access.service.js";
import { ForgejoProvider } from "../../git-provider/forgejo.js";
import { GitHubProvider } from "../../git-provider/github.js";
import { GitLabProvider } from "../../git-provider/gitlab.js";
import type { GitProvider } from "../../git-provider/types.js";
import { logError } from "../../util/log.js";
import { decrypt, encrypt } from "../../util/encrypt.js";
import { reasoningEffortValueList, resolveUserPromptMaxLength } from "@proval/types";
import type {
    ReasoningEffort,
    Repository,
    RepositoryResponse,
    RepositoryInsert,
    RepositoryUpdateInput,
} from "@proval/types";

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

        return { accessToken: decrypt(accessToken), accessTokenId };
    }

    private encryptWebhookSecret(webhookSecret: string): string {
        return encrypt(webhookSecret.trim());
    }

    public async create(data: RepositoryInsert): Promise<RepositoryResponse> {
        if (Object.hasOwn(data, "userPrompt")) {
            data.userPrompt = this.normalizeUserPrompt(data.userPrompt);
        }

        if (Object.hasOwn(data, "reasoningEffort")) {
            data.reasoningEffort = this.normalizeReasoningEffort(data.reasoningEffort);
        }
        const secret = normalizeWebhookSecret(data.webhookSecret);
        const signingToken = normalizeWebhookSigningToken(data.webhookSigningToken);
        if (data.provider !== "gitlab" && signingToken) {
            throw new WebhookCredentialError("Signing token is only configurable for GitLab repositories");
        }
        if (data.provider === "gitlab" && !secret && !signingToken) {
            throw new WebhookCredentialError("Webhook secret or signing token is required");
        }
        if (data.provider === "forgejo" && !secret) {
            throw new WebhookCredentialError("Webhook secret is required");
        }
        const values = {
            ...data,
            webhookSecret: data.provider !== "github" && secret ? this.encryptWebhookSecret(secret) : null,
            webhookSigningToken: signingToken ? encrypt(signingToken) : null,
        };
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
                        accessToken: encrypt(projectAccessToken.token),
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
        if (Object.hasOwn(data, "webhookSecret") || Object.hasOwn(data, "webhookSigningToken")) {
            throw new WebhookCredentialError("Use the dedicated webhook credential update endpoint");
        }
        const cleanData = this.removeUndefined(data);
        if (Object.hasOwn(cleanData, "userPrompt")) {
            cleanData.userPrompt = this.normalizeUserPrompt(cleanData.userPrompt);
        }
        if (Object.hasOwn(cleanData, "reasoningEffort")) {
            cleanData.reasoningEffort = this.normalizeReasoningEffort(cleanData.reasoningEffort);
        }
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
            cleanData.accessToken = encrypt(token);
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
        await db
            .update(repositoryTable)
            .set({ webhookSecret: this.encryptWebhookSecret(webhookSecret) })
            .where(eq(repositoryTable.id, repositoryId));
    }

    public async updateWebhookSigningToken(repositoryId: number, value: unknown): Promise<void> {
        const token = normalizeWebhookSigningToken(value);
        if (!token) throw new WebhookCredentialError("Signing token is required");
        await db
            .update(repositoryTable)
            .set({ webhookSigningToken: encrypt(token) })
            .where(eq(repositoryTable.id, repositoryId));
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

    public async createGitProvider(repositoryId: number): Promise<GitProvider> {
        const repository = await this.findById(repositoryId);

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
            return new GitLabProvider(access.baseUrl, decrypt(accessToken), repository.gitProviderRepositoryId);
        }

        if (repository.provider === "forgejo") {
            if (repository.gitProviderAccessId == null || repository.gitProviderRepositoryId == null) {
                throw new Error("Forgejo repository is missing access or repository id");
            }
            const path = repository.path.trim();
            const slash = path.indexOf("/");
            if (slash <= 0 || slash === path.length - 1) {
                throw new Error("Forgejo repository path must be owner/repo");
            }
            const owner = path.slice(0, slash);
            const repo = path.slice(slash + 1);
            const access = await accessService.findById(repository.gitProviderAccessId);
            const token = await accessService.getAccessToken(repository.gitProviderAccessId);
            return new ForgejoProvider(access.baseUrl, token, owner, repo, repository.gitProviderRepositoryId);
        }

        if (repository.provider === "github") {
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
                privateKey: decrypt(app.privateKey),
                Octokit,
            });
            const octokit = await githubApp.getInstallationOctokit(installation.installationId);
            if (!octokit) {
                throw new Error("Failed to get installation octokit");
            }

            const { data: repo } = await octokit.request("GET /repositories/:repository_id", {
                repository_id: repository.githubRepositoryId,
            });

            return new GitHubProvider(octokit, repo.owner.login, repo.name, `${app.slug}[bot]`);
        }

        throw new Error(`Unsupported repository provider: ${repository.provider}`);
    }

    public async refreshPathFromGitProvider(repositoryId: number): Promise<string> {
        const gitProvider = await this.createGitProvider(repositoryId);
        const path = await gitProvider.fetchRepositoryPath();
        const updated = await this.updatePath(repositoryId, path);
        return updated.path;
    }

    public toResponse(repository: Repository, lastUsedAt: Date | null): RepositoryResponse {
        const {
            webhookSecret: _webhookSecret,
            webhookSigningToken: _webhookSigningToken,
            accessToken: _accessToken,
            accessTokenId: _accessTokenId,
            ...rest
        } = repository;
        return { ...rest, lastUsedAt };
    }

    public async remove(id: number): Promise<void> {
        const repository = await this.findById(id);
        if (repository.provider === "gitlab") {
            try {
                if (repository.gitProviderAccessId == null || repository.gitProviderRepositoryId == null) {
                    throw new Error("GitLab repository is missing access or project id");
                }

                const personalAccessToken = await accessService.getAccessToken(repository.gitProviderAccessId);
                const { accessTokenId: projectAccessTokenId } = await this.getGitLabProjectAccessToken(id);
                const access = await accessService.findById(repository.gitProviderAccessId);

                await GitLabProvider.removeProjectAccessToken(
                    access.baseUrl,
                    personalAccessToken,
                    repository.gitProviderRepositoryId,
                    projectAccessTokenId,
                );
            } catch (error) {
                logError("Failed to remove GitLab project access token", error);
            }
        }
        await db.delete(repositoryTable).where(eq(repositoryTable.id, id));
    }

    private normalizeReasoningEffort(reasoningEffort: unknown): ReasoningEffort {
        if (reasoningEffort == null) {
            return null;
        }
        if (typeof reasoningEffort !== "string") {
            throw new Error("Reasoning effort must be a string");
        }
        const trimmed = reasoningEffort.trim();
        if (!trimmed) {
            return null;
        }
        if (!(reasoningEffortValueList as readonly string[]).includes(trimmed)) {
            throw new Error("Invalid reasoning effort");
        }
        return trimmed as NonNullable<ReasoningEffort>;
    }

    private normalizeUserPrompt(userPrompt: unknown): string | null {
        if (userPrompt == null) {
            return null;
        }
        if (typeof userPrompt !== "string") {
            throw new Error("Custom instructions must be a string");
        }
        const trimmed = userPrompt.trim();
        if (!trimmed) {
            return null;
        }
        const maxLength = resolveUserPromptMaxLength(process.env.PROVAL_USER_PROMPT_MAX_LENGTH);
        if (trimmed.length > maxLength) {
            throw new Error(`Custom instructions must be at most ${maxLength} characters`);
        }
        return trimmed;
    }

    private removeUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
        return Object.fromEntries(Object.entries(obj).filter(([_, v]) => v !== undefined)) as Partial<T>;
    }
}
