import type { Handler } from "hono";
import { RepositoryService } from "./repository.service.js";
import type { RepositoryResponse, RepositoryInsert, RepositoryUpdateInput, SecretInput } from "@proval/types";
import { normalizeWebhookSecret } from "../../util/webhook-secret.js";

export const findAllRepositoryController: Handler = async (c) => {
    const repositoryService = new RepositoryService();
    const repositoryList = await repositoryService.findAll();
    const repositoryResponseList: RepositoryResponse[] = repositoryList.map((repository) =>
        repositoryService.toResponse(repository),
    );
    return c.json(repositoryResponseList, 200);
};

export const findById: Handler = async (c) => {
    const repositoryService = new RepositoryService();
    const repositoryId = c.req.param("id");
    if (!repositoryId) {
        return c.json({ error: "Repository ID is required" }, 400);
    }
    const repository = await repositoryService.findById(parseInt(repositoryId));
    const repositoryResponse = repositoryService.toResponse(repository);
    return c.json(repositoryResponse, 200);
};

export const createRepository: Handler = async (c) => {
    const repositoryService = new RepositoryService();
    const body = await c.req.json<RepositoryInsert>();

    if (body.provider === "gitlab" || body.provider === "forgejo") {
        const secret = normalizeWebhookSecret(body.webhookSecret);
        if (!secret) {
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
        const repository = await repositoryService.create(githubBody as RepositoryInsert);
        const repositoryResponse = repositoryService.toResponse(repository);
        return c.json(repositoryResponse, 201);
    }

    const repository = await repositoryService.create(body);
    const repositoryResponse = repositoryService.toResponse(repository);
    return c.json(repositoryResponse, 201);
};

export const updateRepository: Handler = async (c) => {
    const repositoryService = new RepositoryService();
    const repositoryId = c.req.param("id");
    if (!repositoryId) {
        return c.json({ error: "Repository ID is required" }, 400);
    }
    const body = await c.req.json<RepositoryUpdateInput>();

    const repository = await repositoryService.update(parseInt(repositoryId), body);
    const repositoryResponse = repositoryService.toResponse(repository);
    return c.json(repositoryResponse, 200);
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
    await repositoryService.remove(parseInt(repositoryId));
    return c.json({ message: "Repository deleted" }, 200);
};
