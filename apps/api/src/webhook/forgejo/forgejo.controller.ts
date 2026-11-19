import type { Context } from "hono";
import { ForgejoProvider } from "../../git-provider/forgejo.js";
import type { Access, ModelProvider, Repository } from "@proval/types";
import { log, logError } from "../../util/log.js";
import { isBotMentioned, shouldSkipReplyWithoutMention } from "../../util/mention.js";
import { isAllowedTargetBranch } from "../../util/allowed-target-branch.js";
import { resolveForgejoWebhookEvent, skipIfInsufficientAccess } from "../../util/webhook-controller.js";
import { ActivityService } from "../../api/activity/activity.service.js";
import { activityQueue } from "../../api/activity/activity.queue.js";
import { triageForReview } from "../../triage/triage.service.js";
import { CommentService } from "../../api/comment/comment.service.js";
import {
    isPullRequestPushWhileClosed,
    isPullRequestReopenAction,
    skipPullRequestReviewBeforeQueue,
} from "../pull-request-review-guard.js";

interface ForgejoPullRequestPayload {
    action: string;
    number: number;
    pull_request: {
        number: number;
        title: string;
        body: string | null;
        state: string;
        merged: boolean;
        draft?: boolean;
        base?: { ref?: string };
        head?: { sha?: string };
        user?: { login?: string };
    };
    repository: {
        id: number;
        full_name: string;
        owner: { login: string };
        name: string;
    };
}

interface ForgejoIssuesPayload {
    action: string;
    issue: {
        number: number;
        title: string;
        body: string | null;
        state: string;
        user?: { login?: string };
    };
    repository: {
        id: number;
        full_name: string;
        owner: { login: string };
        name: string;
    };
}

interface ForgejoCommentPayload {
    action: string;
    is_pull?: boolean;
    issue?: {
        number: number;
        pull_request?: { url: string } | null;
    };
    pull_request?: { number: number };
    comment?: {
        id: number;
        body: string;
        user: { login: string };
        created_at?: string;
    };
    review?: {
        type: string;
        content?: string;
        body?: string;
        comments?: Array<{
            id: number;
            body: string;
            user: { login: string };
            in_reply_to?: number | null;
        }>;
    };
    repository: {
        id: number;
        full_name: string;
        owner: { login: string };
        name: string;
    };
    sender?: { login: string };
}

export const handleForgejoWebhook = async (c: Context) => {
    const event = resolveForgejoWebhookEvent(c);

    const repository = c.get("repository") as Repository;
    const modelProvider = c.get("modelProvider") as ModelProvider;
    const access = c.get("access") as Access;

    const payload = c.get("forgejoPayload") as ForgejoPullRequestPayload | ForgejoIssuesPayload | ForgejoCommentPayload;
    try {
        if (event === "pull_request" || event === "pull_request_sync") {
            return await handleForgejoPullRequestWebhook(
                payload as ForgejoPullRequestPayload,
                repository,
                modelProvider,
                access,
            );
        }

        if (event === "issues") {
            return await handleForgejoIssuesWebhook(payload as ForgejoIssuesPayload, repository, modelProvider, access);
        }

        // Handle inline review creation
        if (payload.action === "reviewed") {
            return await handleForgejoReviewedWebhook(payload, repository, modelProvider, access);
        }

        // Handle comment (including inline review comments)
        if (event === "issue_comment" || event === "pull_request_comment" || event === "pull_request_review_comment") {
            return await handleForgejoCommentWebhook(payload, repository, modelProvider, access, event);
        }

        log(`Skipped: event '${event}' is not supported (${repository.path})`, "Forgejo");
        return c.json({ message: `Skipped: event '${event}' is not supported` }, 200);
    } catch (error) {
        logError("Forgejo webhook handler failed", error, "Forgejo");
        return c.json({ error: "Internal server error" }, 500);
    }
};

const handleForgejoPullRequestWebhook = async (
    payload: ForgejoPullRequestPayload,
    repository: Repository,
    modelProvider: ModelProvider,
    access: Access,
) => {
    const action = payload.action;
    const pr = payload.pull_request;
    const prInfo = `[#${pr.number}]: ${pr.title}`;
    if (!repository.prEnabled || !repository.prReviewEnabled) {
        log(`Skipped: review is off - ${prInfo}`, "Forgejo");
        return new Response(JSON.stringify({ message: "Skipped: review is off" }), { status: 200 });
    }

    const reviewMode = repository.prReviewOnPush;

    const allowedAction =
        action === "opened" ||
        action === "reopened" ||
        action === "synchronized" ||
        action === "synchronize" ||
        action === "ready_for_review";
    if (!allowedAction) {
        log(`Skipped: action '${action}' - ${prInfo}`, "Forgejo");
        return new Response(JSON.stringify({ message: `Skipped: action '${action}'` }), {
            status: 200,
        });
    }

    if (repository.prIgnoreDraft && pr.draft === true && action !== "ready_for_review") {
        log(`Skipped: draft pull request - ${prInfo}`, "Forgejo");
        return new Response(JSON.stringify({ message: "Skipped: draft pull request" }), { status: 200 });
    }

    const targetBranch = pr.base?.ref ?? "";
    if (!isAllowedTargetBranch(repository.prAllowedTargetBranchList, targetBranch)) {
        const message = `Skipped: target branch '${targetBranch}' is not allowed`;
        log(`${message} - ${prInfo}`, "Forgejo");
        return new Response(JSON.stringify({ message }), { status: 200 });
    }

    const token = access.accessToken;
    if (!token) {
        return new Response(JSON.stringify({ error: "Repository has no access token" }), {
            status: 500,
        });
    }

    const [owner, repo] = payload.repository.full_name.split("/");
    const forgejoProvider = new ForgejoProvider(access.baseUrl, token, owner, repo);
    const accessSkip = await skipIfInsufficientAccess(
        forgejoProvider,
        pr.user?.login ? { login: pr.user.login } : null,
        repository.prMinAccessLevel,
        "Skipped: missing author",
        "Forgejo",
    );
    if (accessSkip) return accessSkip;

    const isReopen = isPullRequestReopenAction(action, "forgejo");
    if (
        isPullRequestPushWhileClosed({
            provider: "forgejo",
            action,
            pullRequestState: pr.state,
        })
    ) {
        log(`Skipped: pull request is closed - ${prInfo}`, "Forgejo");
        return new Response(JSON.stringify({ message: "Skipped: pull request is closed" }), { status: 200 });
    }

    const activityService = new ActivityService();
    const prNumber = pr.number;

    const version = await forgejoProvider.fetchPullRequestVersion(prNumber);
    const headSha = pr.head?.sha ?? version.headSha;

    const skipMessage = await skipPullRequestReviewBeforeQueue(activityService, {
        repositoryId: repository.id,
        targetIid: prNumber,
        headSha,
        reviewMode,
        isReopen,
    });
    if (skipMessage) {
        log(`${skipMessage} - ${prInfo}`, "Forgejo");
        return new Response(JSON.stringify({ message: skipMessage }), { status: 200 });
    }

    if ((await forgejoProvider.fetchPullRequestChangedFileCount(prNumber)) === 0) {
        log(`Skipped: no changed files - ${prInfo}`, "Forgejo");
        return new Response(JSON.stringify({ message: "Skipped: no changed files" }), { status: 200 });
    }

    // Triage runs on every provider so the record exists; without a versions API it
    // has no delta and classifies the whole pull request from what it can see.
    const triage = await triageForReview({
        provider: forgejoProvider,
        activityService,
        repositoryId: repository.id,
        prIid: prNumber,
        title: pr.title ?? "",
        author: pr.user?.login ?? "",
        enabled: repository.prTriageEnabled,
        logError,
    });
    if (triage.effectiveDepth === "skip") {
        return new Response(JSON.stringify({ message: `Skipped: triage ${triage.record.rule}` }), { status: 200 });
    }

    await activityQueue.push({
        repositoryId: repository.id,
        modelProviderId: modelProvider.id,
        modelName: repository.modelName,
        type: "pr_review",
        targetIid: prNumber,
        headSha,
        triage: triage.record,
    });
    activityQueue.drain();

    log(`PR review queued - ${prInfo}`, "Forgejo");
    return new Response(JSON.stringify({ message: "Review queued" }), { status: 202 });
};

const handleForgejoIssuesWebhook = async (
    payload: ForgejoIssuesPayload,
    repository: Repository,
    modelProvider: ModelProvider,
    access: Access,
) => {
    const issue = payload.issue;
    const issueInfo = `#${issue.number} ${issue.title}`;
    if (payload.action !== "opened") {
        log(`Skipped: action '${payload.action}' (${issueInfo})`, "Forgejo");
        return new Response(JSON.stringify({ message: `Skipped: action '${payload.action}'` }), {
            status: 200,
        });
    }

    if (!repository.issueEnabled || !repository.issueCommentOnOpenEnabled) {
        log(`Skipped: issue comment on open is off (${issueInfo})`, "Forgejo");
        return new Response(JSON.stringify({ message: "Skipped: issue comment on open is off" }), {
            status: 200,
        });
    }

    const token = access.accessToken;
    if (!token) {
        return new Response(JSON.stringify({ error: "Repository has no access token" }), {
            status: 500,
        });
    }

    if (!issue.number) {
        log(`Skipped: no issue number (${issue.title})`, "Forgejo");
        return new Response(JSON.stringify({ message: "No issue number found" }), { status: 200 });
    }

    const [owner, repo] = payload.repository.full_name.split("/");
    const forgejoProvider = new ForgejoProvider(access.baseUrl, token, owner, repo);
    const accessSkip = await skipIfInsufficientAccess(
        forgejoProvider,
        issue.user?.login ? { login: issue.user.login } : null,
        repository.issueMinAccessLevel,
        "Skipped: missing author",
        "Forgejo",
    );
    if (accessSkip) return accessSkip;

    await activityQueue.push({
        repositoryId: repository.id,
        modelProviderId: modelProvider.id,
        modelName: repository.modelName,
        type: "issue_open",
        targetIid: issue.number,
    });
    activityQueue.drain();

    log(`Issue comment queued (${issueInfo})`, "Forgejo");
    return new Response(JSON.stringify({ message: "Issue comment queued" }), { status: 202 });
};

const handleForgejoCommentWebhook = async (
    payload: ForgejoCommentPayload,
    repository: Repository,
    modelProvider: ModelProvider,
    access: Access,
    event: string,
) => {
    const comment = payload.comment;
    const targetIid = payload.pull_request?.number ?? payload.issue?.number;
    const commenterUsername = comment?.user.login ?? "";

    if (payload.action !== "created") {
        log(`Skipped: action '${payload.action}' (#${targetIid ?? "?"} ${commenterUsername})`, "Forgejo");
        return new Response(JSON.stringify({ message: `Skipped: action '${payload.action}'` }), { status: 200 });
    }
    if (!comment?.id) {
        log(`Skipped: missing comment id (#${targetIid ?? "?"})`, "Forgejo");
        return new Response(JSON.stringify({ message: "Skipped: missing comment id" }), { status: 200 });
    }

    const isPullRequest =
        event === "pull_request_comment" ||
        event === "pull_request_review_comment" ||
        payload.is_pull === true ||
        payload.pull_request != null ||
        (payload.issue?.pull_request !== null && payload.issue?.pull_request !== undefined);

    if (isPullRequest) {
        if (!targetIid) {
            log("Skipped: missing pull request number", "Forgejo");
            return new Response(JSON.stringify({ message: "Skipped: missing pull request number" }), { status: 200 });
        }
        const token = access.accessToken;
        if (!token) {
            return new Response(JSON.stringify({ error: "Repository has no access token" }), { status: 500 });
        }
        const [owner, repo] = payload.repository.full_name.split("/");
        const forgejoProvider = new ForgejoProvider(access.baseUrl, token, owner, repo);
        const target = await forgejoProvider.resolvePrReplyTarget(targetIid, comment.id, {
            body: comment.body,
            author: comment.user.login,
            createdAt: comment.created_at,
        });
        return startForgejoPrReply(
            repository,
            modelProvider,
            access,
            payload.repository.full_name,
            targetIid,
            target.commentId,
            target.inlineReviewId,
            comment.body,
            comment.user.login,
            forgejoProvider,
        );
    }

    if (!repository.issueEnabled || !repository.issueReplyEnabled) {
        log(`Skipped: issue reply is off (#${targetIid} ${commenterUsername})`, "Forgejo");
        return new Response(JSON.stringify({ message: "Reply mode is off, skipping" }), { status: 200 });
    }

    const token = access.accessToken;
    if (!token) {
        return new Response(JSON.stringify({ error: "Repository has no access token" }), { status: 500 });
    }
    if (!targetIid) {
        log("Skipped: missing issue number", "Forgejo");
        return new Response(JSON.stringify({ message: "Skipped: missing issue number" }), { status: 200 });
    }

    const [owner, repo] = payload.repository.full_name.split("/");
    const forgejoProvider = new ForgejoProvider(access.baseUrl, token, owner, repo);
    const botUsername = (await forgejoProvider.fetchCurrentUser()).username;
    const mentioned = isBotMentioned(comment.body, [botUsername]);
    if (shouldSkipReplyWithoutMention(repository.issueMentionOnly, mentioned)) {
        return new Response(JSON.stringify({ message: "Skipped: bot not mentioned" }), { status: 200 });
    }

    const accessSkip = await skipIfInsufficientAccess(
        forgejoProvider,
        commenterUsername ? { login: commenterUsername } : null,
        repository.issueMinAccessLevel,
        "Skipped: missing user",
        "Forgejo",
    );
    if (accessSkip) return accessSkip;

    const postedComment = await new CommentService().find(repository.id, "comment", comment.id);
    if (postedComment) {
        return new Response(JSON.stringify({ message: "Skipped: own comment" }), { status: 200 });
    }

    await activityQueue.push({
        repositoryId: repository.id,
        modelProviderId: modelProvider.id,
        modelName: repository.modelName,
        type: "issue_reply",
        targetIid,
        targetCommentId: comment.id,
    });
    activityQueue.drain();

    log(`Issue reply queued (#${targetIid} comment ${comment.id})`, "Forgejo");
    return new Response(JSON.stringify({ message: "Issue reply queued" }), { status: 202 });
};

const handleForgejoReviewedWebhook = async (
    payload: ForgejoCommentPayload,
    repository: Repository,
    modelProvider: ModelProvider,
    access: Access,
) => {
    const prNumber = payload.pull_request?.number;
    const prInfo = `[#${prNumber ?? "?"}]:`;
    if (!prNumber) {
        log("Skipped: missing pull request number", "Forgejo");
        return new Response(JSON.stringify({ message: "Skipped: missing pull request number" }), { status: 200 });
    }

    const reviewType = payload.review?.type;
    if (reviewType !== "comment" && reviewType !== "pull_request_review_comment") {
        log(`Skipped: not a comment review (${reviewType ?? "missing"}) - ${prInfo}`, "Forgejo");
        return new Response(JSON.stringify({ message: "Skipped: not a comment review" }), { status: 200 });
    }

    const token = access.accessToken;
    if (!token) {
        return new Response(JSON.stringify({ error: "Repository has no access token" }), { status: 500 });
    }

    const [owner, repo] = payload.repository.full_name.split("/");
    const forgejoProvider = new ForgejoProvider(access.baseUrl, token, owner, repo);
    const target = await forgejoProvider.resolveReviewedPrReplyTarget(
        prNumber,
        payload.review ?? {},
        payload.sender?.login,
    );
    if (!target) {
        log(`Skipped: no reply target - ${prInfo}`, "Forgejo");
        return new Response(JSON.stringify({ message: "Skipped: no reply target" }), { status: 200 });
    }

    const payloadComment = payload.review?.comments?.at(-1);
    return startForgejoPrReply(
        repository,
        modelProvider,
        access,
        payload.repository.full_name,
        prNumber,
        target.commentId,
        target.inlineReviewId,
        payloadComment?.body ?? payload.review?.content ?? payload.review?.body ?? "",
        payloadComment?.user.login ?? payload.sender?.login ?? "",
        forgejoProvider,
    );
};

async function startForgejoPrReply(
    repository: Repository,
    modelProvider: ModelProvider,
    access: Access,
    repositoryFullName: string,
    prNumber: number,
    commentId: number,
    inlineReviewId: string | null,
    noteBody: string,
    commenterUsername: string,
    provider?: ForgejoProvider,
): Promise<Response> {
    if (!repository.prEnabled || !repository.prReplyEnabled) {
        log(`Skipped: PR reply is off (#${prNumber} ${commenterUsername})`, "Forgejo");
        return new Response(JSON.stringify({ message: "Reply mode is off" }), { status: 200 });
    }

    const token = access.accessToken;
    if (!token) {
        return new Response(JSON.stringify({ error: "Repository has no access token" }), { status: 500 });
    }

    const [owner, repo] = repositoryFullName.split("/");
    const forgejoProvider = provider ?? new ForgejoProvider(access.baseUrl, token, owner, repo);
    const botUsername = (await forgejoProvider.fetchCurrentUser()).username;

    const postedComment = await new CommentService().find(
        repository.id,
        inlineReviewId ? "inline_review" : "comment",
        commentId,
    );
    if (postedComment) {
        return new Response(JSON.stringify({ message: "Skipped: own comment" }), { status: 200 });
    }

    const mentioned = isBotMentioned(noteBody, [botUsername]);
    if (shouldSkipReplyWithoutMention(repository.prMentionOnly, mentioned)) {
        return new Response(JSON.stringify({ message: "Skipped: bot not mentioned" }), { status: 200 });
    }
    const accessSkip = await skipIfInsufficientAccess(
        forgejoProvider,
        commenterUsername ? { login: commenterUsername } : null,
        repository.prMinAccessLevel,
        "Skipped: missing user",
        "Forgejo",
    );
    if (accessSkip) return accessSkip;

    await activityQueue.push({
        repositoryId: repository.id,
        modelProviderId: modelProvider.id,
        modelName: repository.modelName,
        type: "pr_reply",
        targetIid: prNumber,
        targetCommentId: commentId,
        targetInlineReviewId: inlineReviewId,
    });
    activityQueue.drain();

    log(
        `PR reply queued (#${prNumber} comment ${commentId} ${inlineReviewId ? "inline" : "conversation"})`,
        "Forgejo",
    );
    return new Response(JSON.stringify({ message: "Reply queued" }), { status: 202 });
}
