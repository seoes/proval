import { createHmac, timingSafeEqual } from "node:crypto";
import { createMiddleware } from "hono/factory";
import { decrypt } from "../../util/encrypt.js";
import { log } from "../../util/log.js";
import { GiteaProvider } from "../../git-provider/gitea.js";
import { GitLabAccessService } from "../../api/access/access.service.js";
import { fetchWebhookContextRow, originFromWebhookUrl } from "../load-repository.middleware.js";

const accessService = new GitLabAccessService();

export function verifyGiteaSignature(secret: string, rawBody: string, signatureHeader: string | undefined): boolean {
    if (!signatureHeader || !secret) {
        return false;
    }
    let cleanSignature = signatureHeader.trim();
    if (cleanSignature.startsWith("sha256=")) {
        cleanSignature = cleanSignature.slice("sha256=".length);
    }
    let receivedBuf: Buffer;
    try {
        receivedBuf = Buffer.from(cleanSignature, "hex");
    } catch {
        return false;
    }
    const digest = createHmac("sha256", secret).update(rawBody, "utf8").digest();
    if (receivedBuf.length !== digest.length) {
        return false;
    }
    return timingSafeEqual(receivedBuf, digest);
}

export type GiteaWebhookPayload = {
    action?: string;
    repository?: {
        id: number;
        full_name?: string;
        description?: string | null;
        html_url?: string;
    } | null;
};

function parseOwnerRepo(fullName: string): { owner: string; repo: string } | null {
    const slashIndex = fullName.indexOf("/");
    if (slashIndex <= 0 || slashIndex === fullName.length - 1) {
        return null;
    }
    return {
        owner: fullName.slice(0, slashIndex),
        repo: fullName.slice(slashIndex + 1),
    };
}

export const parseGiteaWebhook = createMiddleware(async (c, next) => {
    const rawBody = await c.req.raw.text();

    let payload: GiteaWebhookPayload;
    try {
        payload = JSON.parse(rawBody) as GiteaWebhookPayload;
    } catch {
        return c.json({ error: "Invalid JSON body" }, 400);
    }

    const repositoryId = payload.repository?.id;
    if (repositoryId === undefined) {
        return c.json({ error: "Missing repository in payload" }, 400);
    }

    c.set("giteaWebhookRawBody", rawBody);
    c.set("giteaPayload", payload);
    await next();
});

export const verifyGiteaWebhook = createMiddleware(async (c, next) => {
    const payload = c.get("giteaPayload") as GiteaWebhookPayload;
    const rawBody = c.get("giteaWebhookRawBody") as string;
    const repositoryId = payload.repository?.id;
    if (repositoryId === undefined) {
        return c.json({ error: "Missing repository in payload" }, 400);
    }

    const signature =
        c.req.header("X-Gitea-Signature") ??
        c.req.header("X-Hub-Signature-256") ??
        c.req.header("X-Hub-Signature");

    const existing = await fetchWebhookContextRow(repositoryId, "gitea");
    if (existing) {
        const { repository } = existing;

        const secret = repository.webhookSecret ? decrypt(repository.webhookSecret).trim() : "";
        if (!secret) {
            log("Webhook secret not configured", "Gitea");
            return c.json({ error: "Webhook secret not configured" }, 401);
        }
        if (!verifyGiteaSignature(secret, rawBody, signature)) {
            log("Invalid webhook signature", "Gitea");
            return c.json({ error: "Invalid webhook signature" }, 401);
        }

        c.set("webhookRepositoryRow", existing);
        await next();
        return;
    }

    const instanceBaseUrl = originFromWebhookUrl(payload.repository?.html_url ?? "");
    if (!instanceBaseUrl) {
        return c.json({ error: "Repository not found" }, 404);
    }

    const access = await accessService.findForAutoCreate("gitea", instanceBaseUrl);
    if (!access) {
        return c.json({ error: "Repository not found" }, 404);
    }

    const defaultWebhookSecret = access.defaultWebhookSecret ? decrypt(access.defaultWebhookSecret).trim() : "";
    if (!verifyGiteaSignature(defaultWebhookSecret, rawBody, signature)) {
        log("Invalid webhook signature", "Gitea");
        return c.json({ error: "Invalid webhook signature" }, 401);
    }

    const fullName = payload.repository?.full_name?.trim();
    if (!fullName) {
        return c.json({ error: "Repository not found" }, 404);
    }
    const ownerRepo = parseOwnerRepo(fullName);
    if (!ownerRepo) {
        return c.json({ error: "Repository not found" }, 404);
    }

    const personalAccessToken = decrypt(access.accessToken);
    const gitea = new GiteaProvider(
        access.baseUrl,
        personalAccessToken,
        ownerRepo.owner,
        ownerRepo.repo,
        repositoryId,
    );
    const isCollaborator = await gitea.isConnectedAccountCollaborator();
    if (!isCollaborator) {
        return c.json({ error: "Repository not found" }, 404);
    }

    c.set("webhookRepositoryCreate", {
        access,
        provider: "gitea",
        gitProviderRepositoryId: repositoryId,
        path: fullName,
        description: payload.repository?.description ?? null,
    });

    await next();
});

