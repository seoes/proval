import { gitProviderAccessTable, modelTable, repositoryTable } from "@proval/db";
import db from "../../db/index.js";
import { eq } from "drizzle-orm";
import { createMiddleware } from "hono/factory";

export const loadGitLabContext = createMiddleware(async (c, next) => {
    const payload = await c.req.json();

    const result = await db
        .select({
            repository: repositoryTable,
            model: modelTable,
            access: gitProviderAccessTable,
        })
        .from(repositoryTable)
        .innerJoin(modelTable, eq(repositoryTable.modelId, modelTable.id))
        .innerJoin(gitProviderAccessTable, eq(repositoryTable.gitProviderAccessId, gitProviderAccessTable.id))
        .where(eq(repositoryTable.gitProviderRepositoryId, payload.project?.id));

    if (result.length === 0) {
        return c.json({ error: "Repository not found" }, 404);
    }

    const { repository, model, access } = result[0];

    const secret = repository.webhookSecret.trim();
    if (!secret) {
        return c.json({ error: "Webhook secret not configured" }, 401);
    }
    if (secret !== c.req.header("X-Gitlab-Token")) {
        return c.json({ error: "Unauthorized" }, 401);
    }

    c.set("repository", repository);
    c.set("model", model);
    c.set("gitlabPayload", payload);
    c.set("access", access);
    await next();
});
