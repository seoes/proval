import { createHmac, timingSafeEqual } from "node:crypto";
import { githubAppTable, modelTable, repositoryTable } from "@code-review/db";
import db from "../../db/index.js";
import { and, eq } from "drizzle-orm";
import { createMiddleware } from "hono/factory";

function verifyGithubSignature(secret: string, rawBody: string, signatureHeader: string | undefined): boolean {
    if (!signatureHeader?.startsWith("sha256=")) {
        return false;
    }
    const received = signatureHeader.slice("sha256=".length);
    let receivedBuf: Buffer;
    try {
        receivedBuf = Buffer.from(received, "hex");
    } catch {
        return false;
    }
    const digest = createHmac("sha256", secret).update(rawBody, "utf8").digest();
    if (receivedBuf.length !== digest.length) {
        return false;
    }
    return timingSafeEqual(receivedBuf, digest);
}

export const loadGitHubContext = createMiddleware(async (c, next) => {
    const rawBody = await c.req.raw.text();

    let payload: {
        installation?: { id: number } | null;
        repository?: { id: number } | null;
    };
    try {
        payload = JSON.parse(rawBody) as typeof payload;
    } catch {
        return c.json({ error: "Invalid JSON body" }, 400);
    }

    const installationId = payload.installation?.id;
    const repositoryGithubId = payload.repository?.id;
    if (installationId == null || repositoryGithubId == null) {
        return c.json({ error: "Missing installation or repository in payload" }, 400);
    }

    const result = await db
        .select({
            repository: repositoryTable,
            model: modelTable,
            githubApp: githubAppTable,
        })
        .from(repositoryTable)
        .innerJoin(modelTable, eq(repositoryTable.modelId, modelTable.id))
        .innerJoin(githubAppTable, eq(repositoryTable.githubAppId, githubAppTable.id))
        .where(
            and(
                eq(repositoryTable.githubRepositoryId, repositoryGithubId),
                eq(repositoryTable.githubInstallationId, installationId),
                eq(repositoryTable.provider, "github"),
            ),
        )
        .limit(1);

    if (result.length === 0) {
        return c.json({ error: "Repository not found" }, 404);
    }

    const { repository, model, githubApp } = result[0];

    const signature = c.req.header("X-Hub-Signature-256");
    if (!verifyGithubSignature(githubApp.webhookSecret, rawBody, signature)) {
        return c.json({ error: "Invalid webhook signature" }, 401);
    }

    c.set("repository", repository);
    c.set("model", model);
    c.set("githubApp", githubApp);
    c.set("githubPayload", payload);
    await next();
});
