import type { Repository, RepositoryResponse, RepositoryInsert, RepositoryUpdateInput } from "@proval/types";
import db from "../../db/index.js";
import { githubAppTable, githubInstallationTable, repositoryTable } from "@proval/db";
import { eq } from "drizzle-orm";
import { App } from "@octokit/app";
import { Octokit } from "@octokit/rest";
import { generateUnusedRepositoryWebhookSecret } from "../../util/webhook-secret.js";
import { GitLabAccessService } from "../access/access.service.js";
import { ForgejoProvider } from "../../provider/forgejo.js";
import { GitHubProvider } from "../../provider/github.js";
import { GitLabProvider } from "../../provider/gitlab.js";
import type { GitProvider } from "../../provider/types.js";

const accessService = new GitLabAccessService();

export class RepositoryService {
    public async findAll(): Promise<Repository[]> {
        const repositoryList = await db.select().from(repositoryTable);
        return repositoryList;
    }

    public async findById(repositoryId: number): Promise<Repository> {
        const repositoryList = await db.select().from(repositoryTable).where(eq(repositoryTable.id, repositoryId));
        if (repositoryList.length === 0) {
            throw new Error("Repository not found");
        }
        return repositoryList[0];
    }

    public async create(data: RepositoryInsert): Promise<Repository> {
        const isGitHub = data.provider === "github";
        const isWebhookSecretEmpty =
            data.webhookSecret === undefined || data.webhookSecret === null || data.webhookSecret.trim() === "";
        const values =
            isGitHub && isWebhookSecretEmpty
                ? { ...data, webhookSecret: generateUnusedRepositoryWebhookSecret() }
                : data;
        const result = await db.insert(repositoryTable).values(values).returning();
        return result[0];
    }

    public async update(repositoryId: number, data: RepositoryUpdateInput): Promise<Repository> {
        const cleanData = this.removeUndefined(data);
        const result = await db
            .update(repositoryTable)
            .set(cleanData)
            .where(eq(repositoryTable.id, repositoryId))
            .returning();
        if (result.length === 0) {
            throw new Error("Repository not found");
        }
        return result[0];
    }

    public async updateWebhookSecret(repositoryId: number, webhookSecret: string): Promise<void> {
        await db.update(repositoryTable).set({ webhookSecret }).where(eq(repositoryTable.id, repositoryId));
    }

    public async updatePath(repositoryId: number, path: string): Promise<Repository> {
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
        return result[0];
    }

    public async refreshPathFromGitProvider(repositoryId: number): Promise<string> {
        const repository = await this.findById(repositoryId);

        let gitProvider: GitProvider;
        if (repository.provider === "gitlab") {
            if (repository.gitProviderAccessId == null || repository.gitProviderRepositoryId == null) {
                throw new Error("GitLab repository is missing access or project id");
            }
            const access = await accessService.findById(repository.gitProviderAccessId);
            const token = await accessService.getAccessToken(repository.gitProviderAccessId);
            gitProvider = new GitLabProvider(access.baseUrl, token, repository.gitProviderRepositoryId);
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

    public toResponse(repository: Repository): RepositoryResponse {
        const { webhookSecret: _webhookSecret, ...rest } = repository;
        return rest;
    }

    public async remove(id: number): Promise<void> {
        await db.delete(repositoryTable).where(eq(repositoryTable.id, id));
    }

    private removeUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
        return Object.fromEntries(Object.entries(obj).filter(([_, v]) => v !== undefined)) as Partial<T>;
    }
}
