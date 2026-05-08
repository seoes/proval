import type { Handler } from "hono";
import { RepositoryService } from "./repository.service.js";
import type { RepositoryResponse, RepositoryInsert, RepositoryUpdateInput, SecretInput } from "@code-review/types";

export const findAllRepositoryController: Handler = async (c) => {
    const repositoryService = new RepositoryService();
    const repositoryList = await repositoryService.findAll();
    const repositoryResponseList: RepositoryResponse[] = repositoryList.map((repository) =>
        repositoryService.toResponse(repository),
    );
    console.log(repositoryResponseList);
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
    const repository = await repositoryService.create(body);
    const repositoryResponse = repositoryService.toResponse(repository);
    return c.json(repositoryResponse, 201);
};

export const updateRepository: Handler = async (c) => {
    console.log("updateRepository");
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

export const updateGitlabAccessToken: Handler = async (c) => {
    const repositoryService = new RepositoryService();
    const repositoryId = c.req.param("id");
    if (!repositoryId) {
        return c.json({ error: "Repository ID is required" }, 400);
    }
    const { value: gitlabAccessToken } = await c.req.json<SecretInput>();
    if (!gitlabAccessToken) {
        return c.json({ error: "GitLab access token is required" }, 400);
    }
    await repositoryService.updateGitlabAccessToken(parseInt(repositoryId), gitlabAccessToken);
    return c.json({ message: "GitLab access token updated" }, 200);
};

export const updateWebhookSecret: Handler = async (c) => {
    const repositoryService = new RepositoryService();
    const repositoryId = c.req.param("id");
    if (!repositoryId) {
        return c.json({ error: "Repository ID is required" }, 400);
    }
    const { value: webhookSecret } = await c.req.json<SecretInput>();
    if (!webhookSecret) {
        return c.json({ error: "Webhook secret is required" }, 400);
    }
    await repositoryService.updateWebhookSecret(parseInt(repositoryId), webhookSecret);
    return c.json({ message: "Webhook secret updated" }, 200);
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
