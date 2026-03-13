import { llmConfigTable, repositoryTable } from "../../db/schema.js";
import db from "../../db/index.js";
import { eq } from "drizzle-orm";
import { createMiddleware } from "hono/factory";

export const loadGitLabContext = createMiddleware(async (c, next) => {
    const payload = await c.req.json();

    const result = await db
        .select({
            repository: repositoryTable,
            llm: llmConfigTable,
        })
        .from(repositoryTable)
        .innerJoin(llmConfigTable, eq(repositoryTable.llmId, llmConfigTable.id))
        .where(eq(repositoryTable.gitlabRepositoryId, payload.project?.id));

    if (result.length === 0) {
        return c.json({ error: "Repository not found" }, 404);
    }

    const { repository, llm } = result[0];

    if (repository.replyMode === "off") {
        return c.json({ error: "Note reply mode is off" }, 400);
    }

    if (repository.webhookSecret !== c.req.header("X-Gitlab-Token")) {
        return c.json({ error: "Invalid token" }, 401);
    }

    c.set("repository", repository);
    c.set("llm", llm);
    await next();
});
