import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { GitLabAccessService } from "./access.service";
import { GitLabProvider } from "../../git-provider/gitlab";
import { ForgejoProvider } from "../../git-provider/forgejo";
import { GiteaProvider } from "../../git-provider/gitea";
import { WebhookCredentialError } from "../../util/webhook-secret.js";
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
    } else if (access.provider === "gitea") {
        const testResult = await accessService.testGitea(access.baseUrl, accessToken);
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
        } else if (provider === "gitea") {
            result = await accessService.testGitea(baseUrl, accessToken);
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
    try {
        const access = await accessService.updateById(id, body);
        return c.json(access, 200);
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes("NOT_FOUND") || msg.includes("not found")) {
            return c.json({ error: "Access configuration not found" }, 404);
        }
        if (
            e instanceof WebhookCredentialError ||
            msg.includes("required") ||
            msg.includes("auto create") ||
            msg === "Name is required" ||
            msg === "Base URL is required"
        ) {
            return c.json({ error: msg }, 400);
        }
        if (msg.includes("UNIQUE") || msg.includes("unique")) {
            return c.json({ error: "This access already exists" }, 409);
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

        let provider: GitLabProvider | ForgejoProvider | GiteaProvider | null = null;

        if (access.provider === "gitlab") {
            provider = new GitLabProvider(access.baseUrl, accessToken, 0);
        } else if (access.provider === "forgejo") {
            provider = new ForgejoProvider(access.baseUrl, accessToken, "", "");
        } else if (access.provider === "gitea") {
            provider = new GiteaProvider(access.baseUrl, accessToken, "", "");
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

export const getAccessOverview = async (c: Context) => {
    const id = parseInt(c.req.param("id") ?? "", 10);
    if (!Number.isFinite(id)) {
        return c.json({ error: "Invalid access configuration id" }, 400);
    }
    try {
        const access = await accessService.findById(id);
        const accessToken = await accessService.getAccessToken(id);

        if (access.provider !== "gitea" && access.provider !== "forgejo") {
            return c.json({ error: "Overview is only supported for Gitea and Forgejo" }, 400);
        }

        const provider = new GiteaProvider(access.baseUrl, accessToken, "", "");
        const [user, organizationList] = await Promise.all([
            provider.fetchUserDetail(),
            provider.fetchOrganizationList(),
        ]);

        return c.json({ user, organizationList }, 200);
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: "Failed to fetch access overview", message: msg }, 500);
    }
};

export const getPagedRepositoryList = async (c: Context) => {
    const id = parseInt(c.req.param("id") ?? "", 10);
    if (!Number.isFinite(id)) {
        return c.json({ error: "Invalid access configuration id" }, 400);
    }
    const query = c.req.query();
    const org = query.org?.trim();
    const page = Math.max(1, parseInt(query.page ?? "1", 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(query.limit ?? "10", 10) || 10));

    try {
        const access = await accessService.findById(id);
        const accessToken = await accessService.getAccessToken(id);
        const connectedRepositoryIdList = await accessService.getConnectedGitProviderRepositoryIds(id);

        if (access.provider !== "gitea" && access.provider !== "forgejo") {
            return c.json({ error: "Paged repository list is only supported for Gitea and Forgejo" }, 400);
        }

        const provider = new GiteaProvider(access.baseUrl, accessToken, "", "");
        const result = await provider.fetchPagedRepositoryList({ org, page, limit });

        const repositoryList = result.repositoryList.map((repo) => ({
            ...repo,
            alreadyConnected: connectedRepositoryIdList.has(repo.id),
        }));

        return c.json(
            {
                repositoryList,
                total: result.total,
                page: result.page,
                limit: result.limit,
            },
            200,
        );
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: "Failed to fetch paged repository list", message: msg }, 500);
    }
};

export const getPagedPullRequestList = async (c: Context) => {
    const id = parseInt(c.req.param("id") ?? "", 10);
    if (!Number.isFinite(id)) {
        return c.json({ error: "Invalid access configuration id" }, 400);
    }
    const query = c.req.query();
    const owner = String(query.owner ?? "").trim();
    const repo = String(query.repo ?? "").trim();
    const state = (query.state as "all" | "open" | "closed" | "merged") ?? "all";
    const page = Math.max(1, parseInt(query.page ?? "1", 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(query.limit ?? "10", 10) || 10));

    if (!owner || !repo) {
        return c.json({ error: "owner and repo parameters are required" }, 400);
    }

    try {
        const access = await accessService.findById(id);
        const accessToken = await accessService.getAccessToken(id);

        if (access.provider !== "gitea" && access.provider !== "forgejo") {
            return c.json({ error: "Pull requests query is only supported for Gitea and Forgejo" }, 400);
        }

        const provider = new GiteaProvider(access.baseUrl, accessToken, owner, repo);
        const result = await provider.fetchPagedPullRequestList(owner, repo, { state, page, limit });

        return c.json(result, 200);
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: "Failed to fetch pull request list", message: msg }, 500);
    }
};

export const getPullRequestDetail = async (c: Context) => {
    const id = parseInt(c.req.param("id") ?? "", 10);
    if (!Number.isFinite(id)) {
        return c.json({ error: "Invalid access configuration id" }, 400);
    }
    const query = c.req.query();
    const owner = String(query.owner ?? "").trim();
    const repo = String(query.repo ?? "").trim();
    const index = parseInt(query.index ?? "", 10);

    if (!owner || !repo || !Number.isFinite(index) || index <= 0) {
        return c.json({ error: "owner, repo and positive index parameters are required" }, 400);
    }

    try {
        const access = await accessService.findById(id);
        const accessToken = await accessService.getAccessToken(id);

        if (access.provider !== "gitea" && access.provider !== "forgejo") {
            return c.json({ error: "Pull request detail query is only supported for Gitea and Forgejo" }, 400);
        }

        const provider = new GiteaProvider(access.baseUrl, accessToken, owner, repo);
        const detail = await provider.fetchPullRequestDiffDetail(owner, repo, index);

        return c.json(detail, 200);
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const status = (e as { status?: number }).status ?? 500;
        return c.json(
            { error: "Failed to fetch pull request detail", message: msg },
            status >= 400 && status < 600 ? (status as ContentfulStatusCode) : 500,
        );
    }
};
