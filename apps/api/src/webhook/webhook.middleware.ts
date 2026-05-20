import { modelTable, repositoryTable } from "@code-review/db";
import type { InferSelectModel } from "drizzle-orm";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import pc from "picocolors";

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

function parseGiteaWebhook(c: Context, forgejo: boolean): WebhookIngress {
    const p = c.get(forgejo ? "forgejoPayload" : "githubPayload") as any;
    const pr = p?.pull_request;
    const issue = p?.issue;
    const webhookEvent = forgejo
        ? (c.req.header("X-Forgejo-Event") ?? c.req.header("X-Gitea-Event") ?? "unknown")
        : (c.req.header("X-GitHub-Event") ?? "unknown");

    let eventType = "UNKNOWN";
    let action: string | undefined;
    let number: number | undefined;
    let title: string | undefined;

    if (!forgejo && webhookEvent === "ping") {
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

    const ingress = c.req.path.includes("gitlab")
        ? parseGitLabWebhook(c)
        : parseGiteaWebhook(c, c.req.path.includes("forgejo"));

    const line = (label: string, value: string) =>
        console.log(`  ${pc.bold(label.padEnd(22))} ${value}`);

    const rows: [string, string][] = [
        ["Provider:", pc.cyan((repository.provider ?? "unknown").toUpperCase())],
        ["Event Type:", pc.cyan(ingress.eventType)],
        ["Webhook Event:", pc.yellow(ingress.webhookEvent)],
        ["Action:", ingress.action ?? "-"],
        ["Number:", String(ingress.number ?? "-")],
        ["Title:", ingress.title ? ingress.title.slice(0, 80) : "-"],
        ["Repository Name:", repository.name],
        ["Repository ID:", String(repository.id)],
        ["Repository Path:", repository.githubRepositoryPath ?? "-"],
        ["Git Provider Repository ID:", String(repository.gitProviderRepositoryId ?? "-")],
        ["Model Label:", model.label],
        ["Model Name:", model.name],
        ["Model ID:", String(model.id)],
    ];

    console.log(`\n${pc.dim("─".repeat(60))}`);
    console.log(pc.bold(`  [PROVAL:WEBHOOK]  ${pc.dim(new Date().toISOString())}\n`));
    for (const [label, value] of rows) line(label, value);
    console.log(`\n${pc.dim("─".repeat(60))}\n`);

    await next();
});
