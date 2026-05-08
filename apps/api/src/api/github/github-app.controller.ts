import type { Context } from "hono";
import { App } from "@octokit/app";
import { eq, isNotNull } from "drizzle-orm";
import db from "../../db/index.js";
import { githubAppTable, repositoryTable } from "@code-review/db";

type ManifestConversionResult = {
    id: number;
    slug: string;
    pem: string;
    webhook_secret?: string;
};

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

export const createGitHubAppManually = async (c: Context) => {
    const body = await c.req.json();
    const appId = Number(body.appId);
    const slugInput = String(body.slug ?? "").trim();
    const privateKey = String(body.privateKey ?? "").trim();
    const webhookSecret = String(body.webhookSecret ?? "").trim();

    if (!Number.isFinite(appId) || appId <= 0 || !slugInput || !privateKey || !webhookSecret) {
        return c.json({ error: "appId, slug, privateKey, and webhookSecret are required" }, 400);
    }

    let appAuth: App;
    try {
        appAuth = new App({ appId, privateKey });
    } catch {
        return c.json({ error: "Invalid private key" }, 400);
    }

    let data: { id: number; slug?: string };
    try {
        const res = await appAuth.octokit.request("GET /app", {});
        data = res.data as typeof data;
    } catch {
        return c.json({ error: "Could not verify App with GitHub; check appId and privateKey" }, 401);
    }

    if (data.id !== appId) {
        return c.json({ error: "GitHub returned a different app id than expected" }, 400);
    }

    const slug = data.slug || slugInput;

    try {
        const inserted = await db
            .insert(githubAppTable)
            .values({
                appId,
                slug,
                privateKey,
                webhookSecret,
            })
            .returning({ id: githubAppTable.id });

        return c.json({ id: inserted[0].id, slug }, 201);
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes("UNIQUE") || msg.includes("unique")) {
            return c.json({ error: "This GitHub App is already registered" }, 409);
        }
        throw e;
    }
};

export const handleGitHubAppCallback = async (c: Context) => {
    const body = await c.req.json();
    const { code, state } = body;

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
        const errText = await response.text();
        return c.json({ error: "Failed to convert manifest", detail: errText }, 502);
    }

    const result = (await response.json()) as ManifestConversionResult;

    try {
        const inserted = await db
            .insert(githubAppTable)
            .values({
                appId: result.id,
                slug: result.slug,
                privateKey: result.pem,
                webhookSecret: result.webhook_secret ?? "",
            })
            .returning({ id: githubAppTable.id });

        return c.json({ slug: result.slug, id: inserted[0].id }, 200);
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes("UNIQUE") || msg.includes("unique")) {
            return c.json({ error: "This GitHub App is already registered" }, 409);
        }
        throw e;
    }
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

    const iid = Number(installationId);

    for (const row of apps) {
        const app = new App({ appId: row.appId, privateKey: row.privateKey });
        try {
            const { data: installation } = await app.octokit.request("GET /app/installations/{installation_id}", {
                installation_id: iid,
            });

            return c.json(
                {
                    installationId: iid,
                    githubAppId: row.id,
                    account:
                        installation.account && "login" in installation.account
                            ? String((installation.account as { login: string }).login)
                            : "",
                    type:
                        installation.account && "type" in installation.account
                            ? String((installation.account as { type?: string }).type ?? "")
                            : "",
                },
                200,
            );
        } catch {
            continue;
        }
    }

    return c.json({ error: "Installation not found or not accessible" }, 404);
};

export const findGitHubAppInstallationList = async (c: Context) => {
    const idParam = c.req.param("id");
    const id = parseInt(idParam ?? "", 10);
    if (!Number.isFinite(id)) {
        return c.json({ error: "Invalid app id" }, 400);
    }

    const rows = await db.select().from(githubAppTable).where(eq(githubAppTable.id, id)).limit(1);
    if (rows.length === 0) {
        return c.json({ error: "GitHub App not found" }, 404);
    }

    const row = rows[0];
    const app = new App({ appId: row.appId, privateKey: row.privateKey });

    const { data: installations } = await app.octokit.request("GET /app/installations", {
        per_page: 100,
    });

    const instList = Array.isArray(installations) ? installations : [];
    const list = instList.map((inst) => {
        const acc = inst.account;
        const login = acc && "login" in acc ? String((acc as { login: string }).login) : "";
        const accType = acc && "type" in acc ? String((acc as { type?: string }).type ?? "") : "";
        return {
            id: inst.id,
            account: login,
            type: accType,
        };
    });

    return c.json(list, 200);
};

export const findGitHubAppInstallationRepositoryList = async (c: Context) => {
    const idParam = c.req.param("id");
    const installationParam = c.req.param("installationId");
    const appPk = parseInt(idParam ?? "", 10);
    const installationId = parseInt(installationParam ?? "", 10);

    if (!Number.isFinite(appPk) || !Number.isFinite(installationId)) {
        return c.json({ error: "Invalid app or installation id" }, 400);
    }

    const rows = await db.select().from(githubAppTable).where(eq(githubAppTable.id, appPk)).limit(1);
    if (rows.length === 0) {
        return c.json({ error: "GitHub App not found" }, 404);
    }

    const row = rows[0];
    const app = new App({ appId: row.appId, privateKey: row.privateKey });

    let octokit: Awaited<ReturnType<App["getInstallationOctokit"]>>;
    try {
        octokit = await app.getInstallationOctokit(installationId);
    } catch {
        return c.json({ error: "Installation not accessible for this app" }, 404);
    }

    const connectedRows = await db
        .select({ githubRepositoryId: repositoryTable.githubRepositoryId })
        .from(repositoryTable)
        .where(isNotNull(repositoryTable.githubRepositoryId));

    const connected = new Set(connectedRows.map((r) => r.githubRepositoryId).filter((x): x is number => x != null));

    const { data } = await octokit.request("GET /installation/repositories", { per_page: 100 });
    type GhRepo = { id: number; full_name: string; private: boolean };
    const repositories = (data.repositories ?? []) as GhRepo[];

    const list = repositories.map((repo) => ({
        id: repo.id,
        fullName: repo.full_name,
        private: repo.private,
        alreadyConnected: connected.has(repo.id),
    }));

    return c.json(list, 200);
};
