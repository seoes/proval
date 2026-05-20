import { createHmac, timingSafeEqual } from "node:crypto";
import { gitProviderAccessTable, modelTable, repositoryTable } from "@code-review/db";
import db from "../../db/index.js";
import { and, eq } from "drizzle-orm";
import { createMiddleware } from "hono/factory";

function verifyForgejoSignature(secret: string, rawBody: string, signatureHeader: string | undefined): boolean {
    if (!signatureHeader) {
        return false;
    }
    const receivedBuf = Buffer.from(signatureHeader, "hex");
    const digest = createHmac("sha256", secret).update(rawBody, "utf8").digest();
    if (receivedBuf.length !== digest.length) {
        return false;
    }
    return timingSafeEqual(receivedBuf, digest);
}

export const loadForgejoContext = createMiddleware(async (c, next) => {
    const rawBody = await c.req.raw.text();

    let payload: {
        repository?: { id: number } | null;
    };
    try {
        payload = JSON.parse(rawBody) as typeof payload;
    } catch {
        return c.json({ error: "Invalid JSON body" }, 400);
    }

    const repositoryId = payload.repository?.id;
    if (repositoryId == null) {
        return c.json({ error: "Missing repository in payload" }, 400);
    }

    const result = await db
        .select({
            repository: repositoryTable,
            model: modelTable,
            access: gitProviderAccessTable,
        })
        .from(repositoryTable)
        .innerJoin(modelTable, eq(repositoryTable.modelId, modelTable.id))
        .innerJoin(gitProviderAccessTable, eq(repositoryTable.gitProviderAccessId, gitProviderAccessTable.id))
        .where(
            and(
                eq(repositoryTable.gitProviderRepositoryId, repositoryId),
                eq(repositoryTable.provider, "forgejo"),
            ),
        )
        .limit(1);

    if (result.length === 0) {
        return c.json({ error: "Repository not found" }, 404);
    }

    const { repository, model, access } = result[0];

    const secret = repository.webhookSecret.trim();
    if (!secret) {
        return c.json({ error: "Webhook secret not configured" }, 401);
    }
    const signature = c.req.header("X-Forgejo-Signature") ?? c.req.header("X-Gitea-Signature");
    if (!verifyForgejoSignature(secret, rawBody, signature)) {
        return c.json({ error: "Invalid webhook signature" }, 401);
    }

    c.set("repository", repository);
    c.set("model", model);
    c.set("access", access);
    c.set("forgejoPayload", payload);
    await next();
});
