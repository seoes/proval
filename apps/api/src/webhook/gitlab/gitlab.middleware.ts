import { modelTable, repositoryTable } from "@code-review/db";
import db from "../../db/index.js";
import { eq } from "drizzle-orm";
import { createMiddleware } from "hono/factory";

export const loadGitLabContext = createMiddleware(async (c, next) => {
    const payload = await c.req.json();

    const result = await db
        .select({
            repository: repositoryTable,
            model: modelTable,
        })
        .from(repositoryTable)
        .innerJoin(modelTable, eq(repositoryTable.modelId, modelTable.id))
        .where(eq(repositoryTable.gitlabRepositoryId, payload.project?.id));

    if (result.length === 0) {
        return c.json({ error: "Repository not found" }, 404);
    }

    const { repository, model } = result[0];

    if (repository.webhookSecret && repository.webhookSecret !== c.req.header("X-Gitlab-Token")) {
        return c.json({ error: "Invalid token" }, 401);
    }

    c.set("repository", repository);
    c.set("model", model);
    c.set("gitlabPayload", payload);
    await next();
});
