import { gitProviderAccessTable, modelProviderTable, repositoryTable } from "@proval/db";
import db from "../../db/index.js";
import { eq } from "drizzle-orm";
import { createMiddleware } from "hono/factory";
import { decrypt } from "../../util/encrypt.js";

export const loadGitLabContext = createMiddleware(async (c, next) => {
    const payload = await c.req.json();

    const result = await db
        .select({
            repository: repositoryTable,
            modelProvider: modelProviderTable,
            access: gitProviderAccessTable,
        })
        .from(repositoryTable)
        .innerJoin(modelProviderTable, eq(repositoryTable.modelProviderId, modelProviderTable.id))
        .innerJoin(gitProviderAccessTable, eq(repositoryTable.gitProviderAccessId, gitProviderAccessTable.id))
        .where(eq(repositoryTable.gitProviderRepositoryId, payload.project?.id));

    if (result.length === 0) {
        return c.json({ error: "Repository not found" }, 404);
    }

    const { repository, modelProvider, access } = result[0];

    const secret = decrypt(repository.webhookSecret).trim();
    if (!secret) {
        return c.json({ error: "Webhook secret not configured" }, 401);
    }
    if (secret !== c.req.header("X-Gitlab-Token")) {
        return c.json({ error: "Unauthorized" }, 401);
    }

    c.set("repository", {
        ...repository,
        accessToken: repository.accessToken ? decrypt(repository.accessToken) : repository.accessToken,
    });
    c.set("modelProvider", { ...modelProvider, apiKey: decrypt(modelProvider.apiKey) });
    c.set("gitlabPayload", payload);
    c.set("access", { ...access, accessToken: decrypt(access.accessToken) });
    await next();
});
