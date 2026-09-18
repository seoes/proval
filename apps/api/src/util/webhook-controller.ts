import type { Context } from "hono";
import type { GitProvider, GitUserPermissionIdentity } from "../git-provider/types.js";
import { log, logError } from "./log.js";

export async function skipIfInsufficientAccess(
    provider: GitProvider,
    identity: GitUserPermissionIdentity | null,
    minAccessLevel: number,
    missingMessage: string,
    logLabel?: string,
): Promise<Response | null> {
    if (minAccessLevel <= 0) return null;
    if (identity == null) {
        if (logLabel) log(missingMessage, logLabel);
        return new Response(JSON.stringify({ message: missingMessage }), { status: 200 });
    }
    let level = 0;
    try {
        level = await provider.fetchUserPermission(identity);
    } catch (error) {
        logError("permission lookup failed", error, logLabel);
        return new Response(JSON.stringify({ message: "Skipped: permission lookup failed" }), { status: 200 });
    }
    if (level < minAccessLevel) {
        if (logLabel) {
            log(
                `Skipped: insufficient permission (${"login" in identity ? identity.login : String(identity.userId)})`,
                logLabel,
            );
        }
        return new Response(JSON.stringify({ message: "Skipped: insufficient permission" }), { status: 200 });
    }
    return null;
}

export function resolveForgejoWebhookEvent(c: Context): string {
    const event =
        c.req.header("X-Forgejo-Event") ||
        c.req.header("X-Gitea-Event") ||
        c.req.header("X-GitHub-Event") ||
        c.req.header("X-Forgejo-Event-Type") ||
        c.req.header("X-Gitea-Event-Type") ||
        c.req.header("X-GitHub-Event-Type") ||
        "";
    return event;
}
