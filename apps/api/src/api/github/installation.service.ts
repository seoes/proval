import { App } from "@octokit/app";
import { Octokit } from "@octokit/rest";
import { eq, isNotNull } from "drizzle-orm";
import db from "../../db/index.js";
import { githubAppTable, githubInstallationTable, repositoryTable } from "@proval/db";
import type { GitHubInstallationResponse, GitHubRepositoryResponse } from "@proval/types";

export class GitHubInstallationService {
    async getInstallationList(appId: number): Promise<GitHubInstallationResponse[]> {
        const appList = await db.select().from(githubAppTable).where(eq(githubAppTable.id, appId)).limit(1);
        if (appList.length === 0) {
            throw new Error("GitHub App not found");
        }

        const app = appList[0];
        const appAuth = new App({
            appId: app.appId,
            privateKey: app.privateKey,
            Octokit,
        });

        // Get saved installations from DB
        const savedInstallations = await db
            .select()
            .from(githubInstallationTable)
            .where(eq(githubInstallationTable.appId, appId));

        if (savedInstallations.length === 0) {
            return [];
        }

        // Fetch account info from GitHub API for each installation
        const results: GitHubInstallationResponse[] = [];
        for (const inst of savedInstallations) {
            try {
                const { data: ghInstallation } = await appAuth.octokit.request(
                    "GET /app/installations/{installation_id}",
                    { installation_id: inst.installationId },
                );
                const account = ghInstallation.account as { login?: string; type?: string } | null;
                results.push({
                    id: inst.id,
                    installationId: inst.installationId,
                    accountName: account?.login ?? "",
                    accountType: (account?.type as "User" | "Organization") ?? "User",
                    createdAt: inst.createdAt,
                    updatedAt: inst.updatedAt,
                });
            } catch {
                // Installation not found on GitHub, skip it
                // User should delete it from Proval
            }
        }

        return results;
    }

    async getRepositoryList(appId: number, installationId: number): Promise<GitHubRepositoryResponse[]> {
        const appList = await db.select().from(githubAppTable).where(eq(githubAppTable.id, appId)).limit(1);

        if (appList.length === 0) {
            throw new Error("GitHub App not found");
        }

        const app = appList[0];

        const installation = await db
            .select()
            .from(githubInstallationTable)
            .where(eq(githubInstallationTable.id, installationId))
            .limit(1);

        if (installation.length === 0) {
            throw new Error("Installation not found");
        }

        const inst = installation[0];
        const appAuth = new App({
            appId: app.appId,
            privateKey: app.privateKey,
            Octokit,
        });

        const octokit = await appAuth.getInstallationOctokit(inst.installationId);
        if (!octokit) {
            throw new Error("Failed to get installation octokit");
        }

        // Get already connected repos
        const connectedRows = await db
            .select({ githubRepositoryId: repositoryTable.githubRepositoryId })
            .from(repositoryTable)
            .where(isNotNull(repositoryTable.githubRepositoryId));

        const connected = new Set(connectedRows.map((r) => r.githubRepositoryId).filter((x): x is number => x != null));

        // Get repository list from GitHub
        const { data } = await octokit.request("GET /installation/repositories", { per_page: 100 });
        type GhRepo = { id: number; full_name: string; private: boolean };
        const repositoryList = (data.repositories ?? []) as GhRepo[];

        return repositoryList.map((repo) => ({
            id: repo.id,
            fullName: repo.full_name,
            private: repo.private,
            alreadyConnected: connected.has(repo.id),
        }));
    }

    async delete(appId: number, installationId: number): Promise<void> {
        const appList = await db.select().from(githubAppTable).where(eq(githubAppTable.id, appId)).limit(1);
        if (appList.length === 0) {
            throw new Error("GitHub App not found");
        }

        // Verify installation belongs to the specified app
        const installation = await db
            .select()
            .from(githubInstallationTable)
            .where(eq(githubInstallationTable.id, installationId))
            .limit(1);

        if (installation.length === 0 || installation[0].appId !== appId) {
            throw new Error("Installation not found for this app");
        }

        const app = appList[0];
        const inst = installation[0];
        const appAuth = new App({
            appId: app.appId,
            privateKey: app.privateKey,
            Octokit,
        });

        // Delete from GitHub first
        try {
            await appAuth.octokit.request("DELETE /app/installations/{installation_id}", {
                installation_id: inst.installationId,
            });
        } catch {
            // If GitHub deletion fails, still proceed with DB deletion
            // (installation may have already been deleted on GitHub)
        }

        // Delete from DB
        await db.delete(githubInstallationTable).where(eq(githubInstallationTable.id, installationId));
    }

    async getInstallUrl(appId: number): Promise<string> {
        const appList = await db.select().from(githubAppTable).where(eq(githubAppTable.id, appId)).limit(1);
        if (appList.length === 0) {
            throw new Error("No GitHub App configured");
        }
        return `https://github.com/apps/${appList[0].slug}/installations/new`;
    }

    async handleSetup(installationId: number, setupAction: string): Promise<{ id: number }> {
        if (setupAction !== "install") {
            throw new Error("Invalid setup action");
        }

        const appList = await db.select().from(githubAppTable).limit(1);
        if (appList.length === 0) {
            throw new Error("No GitHub App configured");
        }

        const app = appList[0];
        const appAuth = new App({
            appId: app.appId,
            privateKey: app.privateKey,
            Octokit,
        });

        // Verify installation exists on GitHub
        await appAuth.octokit.request("GET /app/installations/{installation_id}", {
            installation_id: installationId,
        });

        // Check if already saved
        const existing = await db
            .select()
            .from(githubInstallationTable)
            .where(eq(githubInstallationTable.installationId, installationId))
            .limit(1);

        if (existing.length > 0) {
            return { id: existing[0].id };
        }

        const inserted = await db
            .insert(githubInstallationTable)
            .values({
                installationId,
                appId: app.id,
            })
            .returning({ id: githubInstallationTable.id });

        return { id: inserted[0].id };
    }
}
