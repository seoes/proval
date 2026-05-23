import { modelTable, repositoryTable } from "@proval/db";
import type { InferSelectModel } from "drizzle-orm";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import pc from "picocolors";
import { log } from "../util/log.js";

type Repository = InferSelectModel<typeof repositoryTable>;
type Model = InferSelectModel<typeof modelTable>;

export type WebhookIngress = {
    webhookEvent: string;
    eventType: string;
    action?: string;
    number?: number;
    title?: string;
};

function parseGitLabWebhook(c: Context): WebhookIngress {
    const p = c.get("gitlabPayload") as any;
    const oa = p?.object_attributes;
    const webhookEvent = c.req.header("X-Gitlab-Event") ?? "unknown";

    let eventType = "UNKNOWN";
    let action: string | undefined;
    let number: number | undefined;
    let title: string | undefined;

    if (webhookEvent === "Merge Request Hook" || webhookEvent === "Issue Hook") {
        eventType = webhookEvent === "Merge Request Hook" ? "MERGE REQUEST" : "ISSUE";
        action = oa?.action;
        number = oa?.iid;
        title = oa?.title;
    } else if (webhookEvent === "Note Hook") {
        const onMr = oa?.noteable_type === "MergeRequest";
        eventType = onMr ? "NOTE ON MERGE REQUEST" : "NOTE ON ISSUE";
        action = oa?.action;
        number = onMr ? p?.merge_request?.iid : p?.issue?.iid;
    }

    return { webhookEvent, eventType, action, number, title };
}

function parseGitHubWebhook(c: Context, isForgejo: boolean): WebhookIngress {
    const p = c.get(isForgejo ? "forgejoPayload" : "githubPayload") as any;
    const pr = p?.pull_request;
    const issue = p?.issue;
    const webhookEvent = isForgejo
        ? (c.req.header("X-Forgejo-Event") ?? c.req.header("X-Gitea-Event") ?? "unknown")
        : (c.req.header("X-GitHub-Event") ?? "unknown");

    let eventType = "UNKNOWN";
    let action: string | undefined;
    let number: number | undefined;
    let title: string | undefined;

    if (!isForgejo && webhookEvent === "ping") {
        eventType = "CONNECTIVITY CHECK";
    } else if (webhookEvent === "pull_request") {
        eventType = "MERGE REQUEST";
        action = p?.action;
        number = pr?.number ?? p?.number;
        title = pr?.title;
    } else if (webhookEvent === "issues") {
        eventType = "ISSUE";
        action = p?.action;
        number = issue?.number;
        title = issue?.title;
    } else if (webhookEvent === "issue_comment") {
        eventType = issue?.pull_request ? "NOTE ON MERGE REQUEST" : "NOTE ON ISSUE";
        action = p?.action;
        number = issue?.number;
    }

    return { webhookEvent, eventType, action, number, title };
}

/** After `loadGitLabContext`, `loadGitHubContext`, or `loadForgejoContext`. */
export const logWebhookIngress = createMiddleware(async (c, next) => {
    const repository = c.get("repository") as Repository;
    const model = c.get("model") as Model;

    let ingress: WebhookIngress;

    if (repository.provider === "gitlab") {
        ingress = parseGitLabWebhook(c);
    } else if (repository.provider === "github") {
        ingress = parseGitHubWebhook(c, false);
    } else if (repository.provider === "forgejo") {
        ingress = parseGitHubWebhook(c, true);
    } else {
        return c.json({ error: "Invalid repository provider" }, 400);
    }

    const W = 22;
    const row = (label: string, value: string) => `  ${pc.bold(label.padEnd(W))} ${value}`;
    const divider = pc.dim("─".repeat(60));

    const lineList: string[] = [
        "",
        divider,
        pc.bold("  [PROVAL:WEBHOOK]"),
        "",
        row("Provider:", pc.cyan((repository.provider ?? "unknown").toUpperCase())),
        row("Event Type:", pc.cyan(ingress.eventType)),
        row("Webhook Event:", pc.yellow(ingress.webhookEvent)),
        row("Action:", ingress.action ?? "-"),
        row("Number:", String(ingress.number ?? "-")),
        row("Title:", ingress.title ? ingress.title.slice(0, 80) : "-"),
        row("Repository Name:", repository.name),
        row("Repository ID:", String(repository.id)),
        row("Repository Path:", repository.githubRepositoryPath ?? "-"),
        row("Git Provider Repository ID:", String(repository.gitProviderRepositoryId ?? "-")),
        row("Model Label:", model.label),
        row("Model Name:", model.name),
        row("Model ID:", String(model.id)),
        "",
        divider,
        "",
    ];

    for (const line of lineList) log(line);

    await next();
});
