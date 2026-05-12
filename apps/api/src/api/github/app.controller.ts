import type { Context } from "hono";
import { App } from "@octokit/app";
import { GitHubAppService } from "./app.service.js";
import db from "../../db/index.js";
import { githubAppTable } from "@code-review/db";

const appService = new GitHubAppService();

export const getGitHubApp = async (c: Context) => {
    const app = await appService.get();
    return c.json(app, 200);
};

export const createGitHubApp = async (c: Context) => {
    const body = await c.req.json();
    const appId = Number(body.appId);
    const slugInput = String(body.slug ?? "").trim();
    const privateKey = String(body.privateKey ?? "").trim();
    const webhookSecret = String(body.webhookSecret ?? "").trim();

    if (!Number.isFinite(appId) || appId <= 0 || !slugInput || !privateKey || !webhookSecret) {
        return c.json({ error: "appId, slug, privateKey, and webhookSecret are required" }, 400);
    }

    try {
        const result = await appService.create({
            appId,
            slug: slugInput,
            privateKey,
            webhookSecret,
        });
        return c.json(result, 201);
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes("already exists")) {
            return c.json({ error: "This GitHub App is already registered" }, 409);
        }
        if (msg.includes("different app id")) {
            return c.json({ error: "GitHub returned a different app id than expected" }, 400);
        }
        if (msg.includes("verify")) {
            return c.json({ error: "Could not verify App with GitHub; check appId and privateKey" }, 401);
        }
        throw e;
    }
};

export const handleGitHubAppCallback = async (c: Context) => {
    const body = await c.req.json();
    const { code } = body;

    if (!code) {
        return c.json({ error: "Code is required" }, 400);
    }

    try {
        const result = await appService.createFromManifest(code);
        return c.json(result, 200);
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes("already exists")) {
            return c.json({ error: "This GitHub App is already registered" }, 409);
        }
        throw e;
    }
};

export const deleteGitHubApp = async (c: Context) => {
    try {
        await appService.delete();
        return c.json({ message: "GitHub App deleted" }, 200);
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes("No app to delete")) {
            return c.json({ error: "No GitHub App to delete" }, 404);
        }
        throw e;
    }
};
