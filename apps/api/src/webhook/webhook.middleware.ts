import type { ModelProvider, PrReviewOnClose, Repository } from "@proval/types";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import pc from "picocolors";
import { ActivityService } from "../api/activity/activity.service.js";
import { log } from "../util/log.js";
import { resolveForgejoWebhookEvent } from "../util/webhook-controller.js";

const CANCELED_MERGED_REASON = "Canceled because the pull request was merged";
const CANCELED_CLOSED_REASON = "Canceled because the pull request was closed";

type ClosedPullRequestResolution =
    | { kind: "not_applicable" }
    | { kind: "no_number" }
    | { kind: "closed"; targetIid: number; outcome: "merged" | "closed" };

function resolveClosedPullRequest(c: Context, provider: Repository["provider"]): ClosedPullRequestResolution {
    if (provider === "gitlab") {
        const webhookEvent = c.req.header("X-Gitlab-Event") ?? "";
        if (webhookEvent !== "Merge Request Hook") {
            return { kind: "not_applicable" };
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const payload = c.get("gitlabPayload") as any;
        const action = payload?.object_attributes?.action;
        if (action !== "close" && action !== "merge") {
            return { kind: "not_applicable" };
        }
        const iid = payload?.object_attributes?.iid;
        if (typeof iid !== "number") {
            return { kind: "no_number" };
        }
        return { kind: "closed", targetIid: iid, outcome: action === "merge" ? "merged" : "closed" };
    }

    const isForgejo = provider === "forgejo";
    const webhookEvent = isForgejo ? resolveForgejoWebhookEvent(c) : (c.req.header("X-GitHub-Event") ?? "");
    if (webhookEvent !== "pull_request" && webhookEvent !== "pull_request_sync") {
        return { kind: "not_applicable" };
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload = c.get(isForgejo ? "forgejoPayload" : "githubPayload") as any;
    const action = payload?.action ?? "";
    if (isForgejo && action === "merged") {
        const number = payload?.pull_request?.number ?? payload?.number;
        if (typeof number !== "number") {
            return { kind: "no_number" };
        }
        return { kind: "closed", targetIid: number, outcome: "merged" };
    }
    if (action !== "closed") {
        return { kind: "not_applicable" };
    }
    const number = payload?.pull_request?.number ?? payload?.number;
    if (typeof number !== "number") {
        return { kind: "no_number" };
    }
    const merged = payload?.pull_request?.merged === true;
    return { kind: "closed", targetIid: number, outcome: merged ? "merged" : "closed" };
}

function sortInFlightPullRequestReviewList<T extends { id: number; status: string }>(activityList: T[]): T[] {
    return [...activityList].sort((left, right) => {
        const statusRank = (status: string) => (status === "queued" ? 0 : 1);
        const byStatus = statusRank(left.status) - statusRank(right.status);
        if (byStatus !== 0) {
            return byStatus;
        }
        return left.id - right.id;
    });
}

const activityService = new ActivityService();

export type WebhookIngress = {
    webhookEvent: string;
    eventType: string;
    action?: string;
    number?: number;
    title?: string;
};

export const logWebhookRequest = createMiddleware(async (c, next) => {
    log(`[PROVAL:WEBHOOK] ${c.req.raw.url}`);
    await next();
});

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

function parseGitHubWebhook(c: Context, isForgejo: boolean): WebhookIngress {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = c.get(isForgejo ? "forgejoPayload" : "githubPayload") as any;
    const pr = p?.pull_request;
    const issue = p?.issue;
    const webhookEvent = isForgejo ? resolveForgejoWebhookEvent(c) : (c.req.header("X-GitHub-Event") ?? "unknown");

    let eventType = "UNKNOWN";
    let action: string | undefined;
    let number: number | undefined;
    let title: string | undefined;

    if (!isForgejo && webhookEvent === "ping") {
        eventType = "CONNECTIVITY CHECK";
    } else if (webhookEvent === "pull_request" || webhookEvent === "pull_request_sync") {
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
        const onPullRequest = isForgejo
            ? p?.is_pull === true ||
              p?.pull_request != null ||
              (p?.issue?.pull_request != null && p?.issue?.pull_request !== undefined)
            : Boolean(issue?.pull_request);
        eventType = onPullRequest ? "NOTE ON PULL REQUEST" : "NOTE ON ISSUE";
        action = p?.action;
        number = pr?.number ?? issue?.number;
    } else if (webhookEvent === "pull_request_review_comment") {
        eventType = "NOTE ON PULL REQUEST";
        action = p?.action;
        number = p?.pull_request?.number ?? p?.number;
    } else if (webhookEvent === "pull_request_comment") {
        eventType = "NOTE ON PULL REQUEST";
        action = p?.action;
        number = p?.pull_request?.number ?? p?.number ?? issue?.number;
    }

    return { webhookEvent, eventType, action, number, title };
}

/** After GitLab/Forgejo parse, verify, and loadRepository, or after `loadGitHubContext`. */
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
        row("Reasoning Effort:", repository.reasoningEffort ?? "default"),
        row("Model Provider ID:", String(modelProvider.id)),
        "",
        divider,
        "",
    ];

    for (const line of lineList) log(line);

    await next();
});

export const handleClosedPullRequestReview = createMiddleware(async (c, next) => {
    const repository = c.get("repository") as Repository;
    const resolution = resolveClosedPullRequest(c, repository.provider);

    if (resolution.kind === "not_applicable") {
        await next();
        return;
    }
    if (resolution.kind === "no_number") {
        return c.json({ message: "No pull request number" }, 200);
    }

    const policy: PrReviewOnClose = repository.prReviewOnClose;
    if (policy === "continue") {
        return c.json({ message: "Skipped: continue after close" }, 200);
    }

    const activityList = await activityService.findInFlightPullRequestReviewList(repository.id, resolution.targetIid);
    const hasStartedReview = activityList.some((activity) => activity.status === "started");
    if (policy === "continue_if_started" && hasStartedReview) {
        return c.json({ message: "Skipped: review already started" }, 200);
    }

    const cancelTargetList = sortInFlightPullRequestReviewList(activityList);

    const cancelReason = resolution.outcome === "merged" ? CANCELED_MERGED_REASON : CANCELED_CLOSED_REASON;
    let canceledCount = 0;

    for (const activity of cancelTargetList) {
        try {
            await activityService.cancel(activity.id, cancelReason);
            canceledCount++;
        } catch (error) {
            if (!(error instanceof Error)) {
                throw error;
            }
            if (
                error.message === "Activity not found" ||
                error.message === "Only queued or started activities can be canceled"
            ) {
                continue;
            }
            throw error;
        }
    }

    if (canceledCount > 0) {
        return c.json({ message: "Canceled in-flight review" }, 200);
    }
    return c.json({ message: "Skipped: no review to cancel" }, 200);
});
