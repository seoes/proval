import type { ModelProvider, Repository } from "@proval/types";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import pc from "picocolors";
import { log } from "../util/log.js";

export type WebhookIngress = {
    webhookEvent: string;
    eventType: string;
    action?: string;
    number?: number;
    title?: string;
};

function parseGitLabWebhook(c: Context): WebhookIngress {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = c.get("gitlabPayload") as any;
    const oa = p?.object_attributes;
    const webhookEvent = c.req.header("X-Gitlab-Event") ?? "unknown";

    let eventType = "UNKNOWN";
    let action: string | undefined;
    let number: number | undefined;
    let title: string | undefined;

    if (webhookEvent === "Merge Request Hook" || webhookEvent === "Issue Hook") {
        eventType = webhookEvent === "Merge Request Hook" ? "PULL REQUEST" : "ISSUE";
        action = oa?.action;
        number = oa?.iid;
        title = oa?.title;
    } else if (webhookEvent === "Note Hook") {
        const onPullRequest = oa?.noteable_type === "MergeRequest";
        eventType = onPullRequest ? "NOTE ON PULL REQUEST" : "NOTE ON ISSUE";
        action = oa?.action;
        number = onPullRequest ? p?.merge_request?.iid : p?.issue?.iid;
    }

    return { webhookEvent, eventType, action, number, title };
}

function resolveForgejoWebhookEvent(c: Context): string {
    const eventType = c.req.header("X-Gitea-Event-Type") ?? c.req.header("X-GitHub-Event-Type");
    if (eventType === "pull_request_review_comment") return "pull_request_review_comment";
    if (eventType === "pull_request_comment") return "pull_request_comment";
    return c.req.header("X-Forgejo-Event") ?? c.req.header("X-Gitea-Event") ?? "unknown";
}

function parseGitHubWebhook(c: Context, isForgejo: boolean): WebhookIngress {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = c.get(isForgejo ? "forgejoPayload" : "githubPayload") as any;
    const pr = p?.pull_request;
    const issue = p?.issue;
    const webhookEvent = isForgejo
        ? resolveForgejoWebhookEvent(c)
        : (c.req.header("X-GitHub-Event") ?? "unknown");

    let eventType = "UNKNOWN";
    let action: string | undefined;
    let number: number | undefined;
    let title: string | undefined;

    if (!isForgejo && webhookEvent === "ping") {
        eventType = "CONNECTIVITY CHECK";
    } else if (webhookEvent === "pull_request") {
        eventType = "PULL REQUEST";
        action = p?.action;
        number = pr?.number ?? p?.number;
        title = pr?.title;
    } else if (webhookEvent === "issues") {
        eventType = "ISSUE";
        action = p?.action;
        number = issue?.number;
        title = issue?.title;
    } else if (webhookEvent === "issue_comment") {
        eventType = issue?.pull_request ? "NOTE ON PULL REQUEST" : "NOTE ON ISSUE";
        action = p?.action;
        number = issue?.number;
    } else if (webhookEvent === "pull_request_review_comment") {
        eventType = "NOTE ON PULL REQUEST (inline review)";
        action = p?.action;
        number = p?.pull_request?.number ?? p?.number;
    } else if (webhookEvent === "pull_request_comment") {
        eventType = "NOTE ON PULL REQUEST (inline review)";
        action = p?.action;
        number = p?.pull_request?.number ?? p?.number ?? issue?.number;
    }

    return { webhookEvent, eventType, action, number, title };
}

/** After `loadGitLabContext`, `loadGitHubContext`, or `loadForgejoContext`. */
export const logWebhookIngress = createMiddleware(async (c, next) => {
    const repository = c.get("repository") as Repository;
    const modelProvider = c.get("modelProvider") as ModelProvider;

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
        row("Repository Path:", repository.path),
        row("Repository Description:", repository.description ?? "-"),
        row("Repository ID:", String(repository.id)),
        row("Git Provider Repository ID:", String(repository.gitProviderRepositoryId ?? "-")),
        row("Model Provider:", modelProvider.label),
        row("Model Name:", repository.modelName),
        row("Model Provider ID:", String(modelProvider.id)),
        "",
        divider,
        "",
    ];

    for (const line of lineList) log(line);

    await next();
});
