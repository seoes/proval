import type { Context } from "hono";
import { sign } from "crypto";
import db from "../../db";
import { githubAppTable } from "@code-review/db";

export const findGitHubAppList = async (c: Context) => {
    const appList = await db.select().from(githubAppTable);
    return c.json(
        appList.map((app) => ({
            id: app.id,
            appId: app.appId,
            slug: app.slug,
            createdAt: app.createdAt,
            updatedAt: app.updatedAt,
        })),
        200,
    );
};

export const handleGitHubAppCallback = async (c: Context) => {
    console.log("handleGitHubAppCallback");

    const body = await c.req.json();
    const { code, state } = body;

    console.log("code", code);
    console.log("state", state);

    if (!code || !state) {
        return c.json({ error: "Code or state is required" }, 400);
    }

    const response = await fetch(`https://api.github.com/app-manifests/${code}/conversions`, {
        method: "POST",
        headers: {
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        },
    });

    if (!response.ok) {
        const error = await response.text();
        return c.json({ error: "Failed to convert manifest", detail: error }, 502);
    }
    const result = await response.json();

    console.log("result", result);

    // save the app id and private key to the database

    await db.insert(githubAppTable).values({
        appId: result.id,
        slug: result.slug,
        privateKey: result.pem,
    });

    return c.json({ slug: result.slug }, 200);
};

export const handleGitHubAppSetup = async (c: Context) => {
    const body = await c.req.json();
    const { installationId, setupAction } = body;

    if (!installationId) {
        return c.json({ error: "installationId is required" }, 400);
    }

    if (setupAction !== "install") {
        return c.json({ error: "Invalid setup action" }, 400);
    }

    const apps = await db.select().from(githubAppTable);
    if (apps.length === 0) {
        return c.json({ error: "No GitHub App configured" }, 404);
    }

    const app = apps[0];
    const jwt = generateAppJwt(app.appId, app.privateKey);

    const response = await fetch(`https://api.github.com/app/installations/${installationId}`, {
        headers: {
            Accept: "application/vnd.github+json",
            Authorization: `Bearer ${jwt}`,
            "X-GitHub-Api-Version": "2022-11-28",
        },
    });

    if (!response.ok) {
        return c.json({ error: "Installation not found or not accessible" }, 404);
    }

    const installation = await response.json();

    return c.json(
        {
            installationId: Number(installationId),
            account: installation.account?.login,
            type: installation.account?.type,
        },
        200,
    );
};

function generateAppJwt(appId: number, privateKey: string): string {
    const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");

    const now = Math.floor(Date.now() / 1000);
    const payload = Buffer.from(JSON.stringify({ iat: now - 60, exp: now + 600, iss: appId })).toString("base64url");

    const signature = sign("sha256", Buffer.from(`${header}.${payload}`), privateKey);

    return `${header}.${payload}.${signature.toString("base64url")}`;
}

export const createInstallation = async (c: Context) => {
    const body = await c.req.json();
    const { appId } = body;
};
