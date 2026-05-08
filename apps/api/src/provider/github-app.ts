import { App } from "@octokit/app";
import { Octokit } from "@octokit/rest";
import type { InferSelectModel } from "drizzle-orm";
import { githubAppTable, repositoryTable } from "@code-review/db";
import { GitHubProvider } from "./github.js";

export type RepositoryRow = InferSelectModel<typeof repositoryTable>;
export type GithubAppRow = InferSelectModel<typeof githubAppTable>;

/** GitHub App bots appear as `<slug>[bot]` on comments and reviews. */
export function githubBotUsernameFromSlug(slug: string): string {
    return `${slug}[bot]`;
}

export async function createGitHubProvider(
    repository: RepositoryRow,
    githubApp: GithubAppRow,
): Promise<GitHubProvider> {
    const installationId = repository.githubInstallationId;
    const path = repository.githubRepositoryPath;
    if (installationId == null || !path) {
        throw new Error("GitHub repository missing installation id or path");
    }
    const parts = path.split("/");
    const owner = parts[0];
    const repo = parts[1];
    if (!owner || !repo) {
        throw new Error("githubRepositoryPath must be owner/repo");
    }

    const app = new App({
        appId: githubApp.appId,
        privateKey: githubApp.privateKey,
        Octokit,
    });
    const octokit = await app.getInstallationOctokit(installationId);
    if (!octokit) {
        throw new Error("Failed to get installation octokit");
    }
    return new GitHubProvider(octokit, owner, repo, githubBotUsernameFromSlug(githubApp.slug));
}
