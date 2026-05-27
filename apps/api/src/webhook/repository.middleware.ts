import type { InferSelectModel } from "drizzle-orm";
import { repositoryTable } from "@proval/db";
import { createMiddleware } from "hono/factory";
import type { Context } from "hono";
import { RepositoryService } from "../api/repository/repository.service.js";
import { logError } from "../util/log.js";

type Repository = InferSelectModel<typeof repositoryTable>;
type RepositoryProvider = Repository["provider"];

const repositoryService = new RepositoryService();

export function parseRepositoryPath(provider: RepositoryProvider, payload: unknown): string | null {
    if (payload == null || typeof payload !== "object") {
        return null;
    }

    const record = payload as Record<string, unknown>;

    if (provider === "gitlab") {
        const project = record.project as { path_with_namespace?: string } | undefined;
        const path = project?.path_with_namespace?.trim();
        return path || null;
    }

    const repo = record.repository as { full_name?: string } | undefined;
    const path = repo?.full_name?.trim();
    return path || null;
}

function getWebhookPayload(c: Context, provider: RepositoryProvider): unknown {
    if (provider === "gitlab") {
        return c.get("gitlabPayload");
    }
    if (provider === "github") {
        return c.get("githubPayload");
    }
    return c.get("forgejoPayload");
}

export async function syncRepositoryPathFromWebhook(
    repository: Repository,
    payload: unknown,
): Promise<Repository> {
    const incoming = parseRepositoryPath(repository.provider, payload);
    if (!incoming || repository.path === incoming) {
        return repository;
    }
    return repositoryService.updatePath(repository.id, incoming);
}

export const updateRepositoryPath = createMiddleware(async (c, next) => {
    const repository = c.get("repository") as Repository;

    if (repository.provider === "github") {
        const event = c.req.header("X-GitHub-Event") ?? "";
        if (event === "ping") {
            await next();
            return;
        }
    }

    try {
        const payload = getWebhookPayload(c, repository.provider);
        const updated = await syncRepositoryPathFromWebhook(repository, payload);
        if (updated.path !== repository.path) {
            c.set("repository", updated);
        }
    } catch (error) {
        logError("Failed to sync repository path from webhook", error);
    }

    await next();
});
