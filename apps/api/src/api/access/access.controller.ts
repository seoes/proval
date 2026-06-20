import type { Context } from "hono";
import { GitLabAccessService } from "./access.service";
import { GitLabProvider } from "../../git-provider/gitlab";
import { ForgejoProvider } from "../../git-provider/forgejo";
import type {
    AccessInsert,
    AccessProvider,
    AccessUpdateInput,
    GitProviderRepositoryListResponse,
    SecretInput,
} from "@proval/types";

const accessService = new GitLabAccessService();

export const getAccessList = async (c: Context) => {
    const query = c.req.query();
    const provider = query.provider as AccessProvider;
    if (provider) {
        const accessList = await accessService.findByProvider(provider);
        return c.json(accessList, 200);
    }
    const accessList = await accessService.findAll();
    return c.json(accessList, 200);
};

export const getAccessById = async (c: Context) => {
    const id = parseInt(c.req.param("id") ?? "", 10);
    if (!Number.isFinite(id)) {
        return c.json({ error: "Invalid access configuration id" }, 400);
    }
    const access = await accessService.findById(id);
    return c.json(access, 200);
};

export const createAccess = async (c: Context) => {
    const body = await c.req.json<AccessInsert>();
    const { provider, name, baseUrl, accessToken } = body;
    if (!provider) {
        return c.json({ error: "Provider is required" }, 400);
    }
    if (!name) {
        return c.json({ error: "Name is required" }, 400);
    }
    if (!baseUrl) {
        return c.json({ error: "Base URL is required" }, 400);
    }
    if (!accessToken) {
        return c.json({ error: "Access token is required" }, 400);
    }
    try {
        const access = await accessService.create(provider, name, baseUrl, accessToken);
        return c.json(access, 201);
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes("UNIQUE") || msg.includes("unique")) {
            return c.json({ error: "This access already exists" }, 409);
        }
        throw e;
    }
};

export const testAccess = async (c: Context) => {
    const id = parseInt(c.req.param("id") ?? "", 10);
    if (!Number.isFinite(id)) {
        return c.json({ error: "Invalid access configuration id" }, 400);
    }
    const access = await accessService.findById(id);
    const accessToken = await accessService.getAccessToken(id);

    let result = { success: false, message: "Unknown error" };

    if (access.provider === "gitlab") {
        const testResult = await accessService.testGitLab(access.baseUrl, accessToken);
        result = testResult;
    } else if (access.provider === "forgejo") {
        const testResult = await accessService.testForgejo(access.baseUrl, accessToken);
        result = testResult;
    } else {
        return c.json({ error: "Invalid provider" }, 400);
    }
    return c.json(result, result.success ? 200 : 401);
};

export const testAccessCredentials = async (c: Context) => {
    const body = await c.req.json<{ provider?: AccessProvider; baseUrl?: string; accessToken?: string }>();
    const provider = body.provider;
    const baseUrl = String(body.baseUrl ?? "").trim();
    const accessToken = String(body.accessToken ?? "").trim();

    if (!provider || !baseUrl || !accessToken) {
        return c.json({ error: "provider, baseUrl, and accessToken are required" }, 400);
    }

    let result = { success: false, message: "Unknown error" };

    try {
        if (provider === "gitlab") {
            result = await accessService.testGitLab(baseUrl, accessToken);
        } else if (provider === "forgejo") {
            result = await accessService.testForgejo(baseUrl, accessToken);
        } else {
            return c.json({ error: "Invalid provider" }, 400);
        }
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ success: false, message: msg }, 400);
    }

    return c.json(result, result.success ? 200 : 401);
};

export const updateAccessById = async (c: Context) => {
    const id = parseInt(c.req.param("id") ?? "", 10);
    if (!Number.isFinite(id)) {
        return c.json({ error: "Invalid access configuration id" }, 400);
    }
    const body = await c.req.json<AccessUpdateInput & { accessToken?: string }>();
    const { name, baseUrl, accessToken } = body;
    if (!name) {
        return c.json({ error: "Name is required" }, 400);
    }
    if (!baseUrl) {
        return c.json({ error: "Base URL is required" }, 400);
    }
    try {
        const access = await accessService.updateById(id, name, baseUrl, accessToken);
        return c.json(access, 200);
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes("NOT_FOUND") || msg.includes("not found")) {
            return c.json({ error: "Access configuration not found" }, 404);
        }
        throw e;
    }
};

export const deleteAccessById = async (c: Context) => {
    const id = parseInt(c.req.param("id") ?? "", 10);
    if (!Number.isFinite(id)) {
        return c.json({ error: "Invalid access configuration id" }, 400);
    }
    try {
        await accessService.deleteById(id);
        return c.json({ message: "Access configuration deleted" }, 200);
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes("repositories using this access configuration")) {
            return c.json({ error: msg }, 409);
        }
        if (msg.includes("NOT_FOUND") || msg.includes("not found")) {
            return c.json({ error: "Access configuration not found" }, 404);
        }
        throw e;
    }
};

export const updateAccessTokenById = async (c: Context) => {
    const id = parseInt(c.req.param("id") ?? "", 10);
    if (!Number.isFinite(id)) {
        return c.json({ error: "Invalid access configuration id" }, 400);
    }
    const { value: accessToken } = await c.req.json<SecretInput>();
    if (!accessToken) {
        return c.json({ error: "Access token is required" }, 400);
    }
    try {
        await accessService.updateAccessTokenById(id, accessToken);
        return c.json({ message: "Access token updated" }, 200);
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes("NOT_FOUND") || msg.includes("not found")) {
            return c.json({ error: "Access configuration not found" }, 404);
        }
        throw e;
    }
};

export const getRepositoryListByAccessId = async (c: Context) => {
    const id = parseInt(c.req.param("id") ?? "", 10);
    if (!Number.isFinite(id)) {
        return c.json({ error: "Invalid access configuration id" }, 400);
    }
    try {
        const access = await accessService.findById(id);
        const accessToken = await accessService.getAccessToken(id);
        const connectedRepositoryIdList = await accessService.getConnectedGitProviderRepositoryIds(id);

        let provider: GitLabProvider | ForgejoProvider | null = null;

        if (access.provider === "gitlab") {
            provider = new GitLabProvider(access.baseUrl, accessToken, 0);
        } else if (access.provider === "forgejo") {
            provider = new ForgejoProvider(access.baseUrl, accessToken, "", "");
        }

        if (!provider) {
            return c.json({ error: "Invalid provider" }, 400);
        }

        const repositoryList = await provider.fetchRepositoryList();
        const response: GitProviderRepositoryListResponse[] = repositoryList.map((repo) => ({
            ...repo,
            alreadyConnected: connectedRepositoryIdList.has(repo.id),
        }));
        return c.json(response, 200);
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: "Failed to fetch repository list", message: msg }, 500);
    }
};
