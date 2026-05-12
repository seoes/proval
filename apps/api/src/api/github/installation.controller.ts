import type { Context } from "hono";
import { GitHubInstallationService } from "./installation.service.js";

const installationService = new GitHubInstallationService();

export const getInstallationList = async (c: Context) => {
    const appId = parseInt(c.req.param("id") ?? "", 10);
    if (!Number.isFinite(appId)) {
        return c.json({ error: "Invalid app id" }, 400);
    }

    const installationList = await installationService.getInstallationList(appId);
    return c.json(installationList, 200);
};

export const getRepositoryList = async (c: Context) => {
    const appId = parseInt(c.req.param("id") ?? "", 10);
    const installationId = parseInt(c.req.param("installationId") ?? "", 10);

    if (!Number.isFinite(appId) || !Number.isFinite(installationId)) {
        return c.json({ error: "Invalid app or installation id" }, 400);
    }

    try {
        const repositoryList = await installationService.getRepositoryList(appId, installationId);
        return c.json(repositoryList, 200);
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes("not found")) {
            return c.json({ error: "Installation not found" }, 404);
        }
        throw e;
    }
};

export const deleteInstallation = async (c: Context) => {
    const appId = parseInt(c.req.param("id") ?? "", 10);
    const installationId = parseInt(c.req.param("installationId") ?? "", 10);

    if (!Number.isFinite(appId) || !Number.isFinite(installationId)) {
        return c.json({ error: "Invalid app or installation id" }, 400);
    }

    await installationService.delete(appId, installationId);
    return c.json({ message: "Installation deleted" }, 200);
};

export const getInstallUrl = async (c: Context) => {
    const appId = parseInt(c.req.param("id") ?? "", 10);
    if (!Number.isFinite(appId)) {
        return c.json({ error: "Invalid app id" }, 400);
    }

    try {
        const url = await installationService.getInstallUrl(appId);
        return c.json({ url }, 200);
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes("No GitHub App")) {
            return c.json({ error: "No GitHub App configured" }, 404);
        }
        throw e;
    }
};

export const handleSetup = async (c: Context) => {
    const body = await c.req.json();
    const { installationId, setupAction } = body;

    if (!installationId) {
        return c.json({ error: "installationId is required" }, 400);
    }

    const iid = Number(installationId);
    if (!Number.isFinite(iid)) {
        return c.json({ error: "Invalid installationId" }, 400);
    }

    try {
        const result = await installationService.handleSetup(iid, setupAction);
        return c.json(result, 200);
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes("Invalid setup action")) {
            return c.json({ error: "Invalid setup action" }, 400);
        }
        if (msg.includes("No GitHub App")) {
            return c.json({ error: "No GitHub App configured" }, 404);
        }
        if (msg.includes("Not Found")) {
            return c.json({ error: "Installation not found or not accessible" }, 404);
        }
        throw e;
    }
};
