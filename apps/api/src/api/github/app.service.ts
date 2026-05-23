import { App } from "@octokit/app";
import { Octokit } from "@octokit/rest";
import db from "../../db/index.js";
import { githubAppTable } from "@proval/db";
import { eq } from "drizzle-orm";
import type { GitHubAppResponse, CreateAppInput } from "./types.js";

type ManifestConversionResult = {
    id: number;
    slug: string;
    pem: string;
    webhook_secret?: string;
};

export class GitHubAppService {
    async get(): Promise<GitHubAppResponse[]> {
        const appList = await db.select().from(githubAppTable).limit(1);
        if (appList.length === 0) {
            return [];
        }
        return appList.map((app) => ({
            id: app.id,
            appId: app.appId,
            slug: app.slug,
            createdAt: app.createdAt,
            updatedAt: app.updatedAt,
        }));
    }

    async create(input: CreateAppInput): Promise<{ id: number; slug: string }> {
        const existingAppList = await db.select().from(githubAppTable).limit(1);
        if (existingAppList.length > 0) {
            throw new Error("App already exists. Only one app per instance.");
        }

        // Verify with GitHub
        const appAuth = new App({ appId: input.appId, privateKey: input.privateKey });
        const { data } = await appAuth.octokit.request("GET /app", {});

        if (!data || data.id !== input.appId) {
            throw new Error("GitHub returned a different app id than expected");
        }

        const slug = data.slug || input.slug;
        const inserted = await db
            .insert(githubAppTable)
            .values({
                appId: input.appId,
                slug,
                privateKey: input.privateKey,
                webhookSecret: input.webhookSecret,
            })
            .returning({ id: githubAppTable.id });

        return { id: inserted[0].id, slug };
    }

    async createFromManifest(code: string): Promise<{ id: number; slug: string }> {
        const existingAppList = await db.select().from(githubAppTable).limit(1);
        if (existingAppList.length > 0) {
            throw new Error("App already exists. Only one app per instance.");
        }

        const response = await fetch(`https://api.github.com/app-manifests/${code}/conversions`, {
            method: "POST",
            headers: {
                Accept: "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
            },
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Failed to convert manifest: ${errText}`);
        }

        const result = (await response.json()) as ManifestConversionResult;

        const inserted = await db
            .insert(githubAppTable)
            .values({
                appId: result.id,
                slug: result.slug,
                privateKey: result.pem,
                webhookSecret: result.webhook_secret ?? "",
            })
            .returning({ id: githubAppTable.id });

        return { id: inserted[0].id, slug: result.slug };
    }

    async delete(): Promise<void> {
        const appList = await db.select().from(githubAppTable).limit(1);
        if (appList.length === 0) {
            throw new Error("No app to delete");
        }
        await db.delete(githubAppTable).where(eq(githubAppTable.id, appList[0].id));
    }

    async getInstallationToken(installationId: number): Promise<Octokit> {
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

        const octokit = await appAuth.getInstallationOctokit(installationId);
        if (!octokit) {
            throw new Error("Failed to get installation octokit");
        }

        return octokit;
    }

    getAppRecord() {
        return db.select().from(githubAppTable).limit(1);
    }
}
