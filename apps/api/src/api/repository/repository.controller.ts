import type { Handler } from "hono";
import { RepositoryService } from "./repository.service.js";
import type { RepositoryInsert, RepositoryUpdateInput, SecretInput } from "@proval/types";
import { validateAllowedBranchList } from "../../util/allowed-target-branch.js";
import { log } from "../../util/log.js";
import { normalizeWebhookSecret, WebhookCredentialError } from "../../util/webhook-secret.js";

export const findAllRepositoryController: Handler = async (c) => {
    const repositoryService = new RepositoryService();
    const repositoryList = await repositoryService.findAll();
    return c.json(repositoryList, 200);
};

export const findById: Handler = async (c) => {
    const repositoryService = new RepositoryService();
    const repositoryId = c.req.param("id");
    if (!repositoryId) {
        return c.json({ error: "Repository ID is required" }, 400);
    }
    const repository = await repositoryService.findById(parseInt(repositoryId));
    return c.json(repository, 200);
};

export const createRepository: Handler = async (c) => {
    const repositoryService = new RepositoryService();
    const body = await c.req.json<RepositoryInsert>();

    if (Object.hasOwn(body, "prAllowedTargetBranchList")) {
        try {
            body.prAllowedTargetBranchList = validateAllowedBranchList(body.prAllowedTargetBranchList as string[]);
        } catch (error) {
            const message = error instanceof Error ? error.message : "Invalid allowed target branches";
            return c.json({ error: message }, 400);
        }
    }

    if (body.provider === "gitlab" || body.provider === "forgejo") {
        const secret = normalizeWebhookSecret(body.webhookSecret);
        if (body.provider === "forgejo" && !secret) {
            return c.json({ error: "Webhook secret is required" }, 400);
        }
        body.webhookSecret = secret;
        if (body.gitProviderRepositoryId == null) {
            return c.json({ error: "Git provider repository ID is required" }, 400);
        }
    } else if (body.provider === "github") {
        const { webhookSecret: _webhookSecret, ...githubBody } = body;
        if (githubBody.githubRepositoryId == null) {
            return c.json({ error: "GitHub repository ID is required" }, 400);
        }
        try {
            const repository = await repositoryService.create(githubBody as RepositoryInsert);
            return c.json(repository, 201);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (error instanceof WebhookCredentialError || message.startsWith("Custom instructions")) {
                return c.json({ error: message }, 400);
            }
            throw error;
        }
    }

    try {
        const repository = await repositoryService.create(body);
        return c.json(repository, 201);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (error instanceof WebhookCredentialError || message.startsWith("Custom instructions")) {
            return c.json({ error: message }, 400);
        }
        throw error;
    }
};

export const updateRepository: Handler = async (c) => {
    const repositoryService = new RepositoryService();
    const repositoryId = c.req.param("id");
    if (!repositoryId) {
        return c.json({ error: "Repository ID is required" }, 400);
    }
    const body = await c.req.json<RepositoryUpdateInput>();

    if (Object.hasOwn(body, "prAllowedTargetBranchList")) {
        try {
            body.prAllowedTargetBranchList = validateAllowedBranchList(body.prAllowedTargetBranchList as string[]);
        } catch (error) {
            const message = error instanceof Error ? error.message : "Invalid allowed target branches";
            return c.json({ error: message }, 400);
        }
    }

    try {
        const repository = await repositoryService.update(parseInt(repositoryId), body);
        return c.json(repository, 200);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (error instanceof WebhookCredentialError || message.startsWith("Custom instructions")) {
            return c.json({ error: message }, 400);
        }
        throw error;
    }
};

export const updateWebhookSecret: Handler = async (c) => {
    const repositoryService = new RepositoryService();
    const repositoryId = c.req.param("id");
    if (!repositoryId) {
        return c.json({ error: "Repository ID is required" }, 400);
    }
    const { value } = await c.req.json<SecretInput>();
    const secret = normalizeWebhookSecret(value);
    if (!secret) {
        return c.json({ error: "Webhook secret is required" }, 400);
    }

    let repository;
    try {
        repository = await repositoryService.findById(parseInt(repositoryId));
    } catch {
        return c.json({ error: "Repository not found" }, 404);
    }
    if (repository.provider !== "gitlab" && repository.provider !== "forgejo") {
        return c.json({ error: "Webhook secret is only configurable for GitLab and Forgejo repositories" }, 400);
    }

    await repositoryService.updateWebhookSecret(parseInt(repositoryId), secret);
    return c.json({ message: "Webhook secret updated" }, 200);
};

export const updateWebhookSigningToken: Handler = async (c) => {
    const repositoryService = new RepositoryService();
    const repositoryId = Number(c.req.param("id"));
    if (!Number.isSafeInteger(repositoryId) || repositoryId <= 0) {
        return c.json({ error: "Invalid repository ID" }, 400);
    }
    const { value } = await c.req.json<SecretInput>();
    let repository;
    try {
        repository = await repositoryService.findById(repositoryId);
    } catch {
        return c.json({ error: "Repository not found" }, 404);
    }
    if (repository.provider !== "gitlab") {
        return c.json({ error: "Signing token is only configurable for GitLab repositories" }, 400);
    }
    try {
        await repositoryService.updateWebhookSigningToken(repositoryId, value);
    } catch (error) {
        if (error instanceof WebhookCredentialError) {
            return c.json({ error: error.message }, 400);
        }
        throw error;
    }
    return c.json({ message: "Signing token updated" }, 200);
};

export const refreshRepositoryPath: Handler = async (c) => {
    const repositoryService = new RepositoryService();
    const repositoryId = parseInt(c.req.param("id") ?? "", 10);
    if (!Number.isFinite(repositoryId)) {
        return c.json({ error: "Repository ID is required" }, 400);
    }

    try {
        const path = await repositoryService.refreshPathFromGitProvider(repositoryId);
        return c.json({ path }, 200);
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes("not found") || msg.includes("Not found")) {
            return c.json({ error: "Repository not found" }, 404);
        }
        if (
            msg.includes("missing") ||
            msg.includes("Unsupported") ||
            msg.includes("not found") ||
            msg.includes("Not found")
        ) {
            return c.json({ error: msg }, 400);
        }
        return c.json({ error: "Failed to refresh repository path from Git provider", message: msg }, 502);
    }
};

export const removeRepository: Handler = async (c) => {
    const repositoryService = new RepositoryService();
    const repositoryId = c.req.param("id");
    if (!repositoryId) {
        return c.json({ error: "Repository ID is required" }, 400);
    }
    try {
        await repositoryService.remove(parseInt(repositoryId));
        return c.json({ message: "Repository deleted" }, 200);
    } catch (error) {
        return c.json({ error: error instanceof Error ? error.message : "Failed to delete" }, 400);
    }
};
