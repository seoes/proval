import type { Context } from "hono";
import { ForgejoProvider } from "../../git-provider/forgejo.js";
import type { GitProvider, GitUserPermissionIdentity } from "../../git-provider/types.js";
import type { Access, ModelProvider, Repository } from "@proval/types";
import { log, logError } from "../../util/log.js";
import { runWithActivity } from "../../api/activity/activity.runner.js";
import { ActivityService } from "../../api/activity/activity.service.js";
import { createSender } from "../../agent/llm/factory.js";
import { runPullRequestReply, runPullRequestReview } from "../../agent/pull-request";
import { runIssueReplyOnOpen, runIssueReply } from "../../agent/issue";
import { Workspace } from "../../git-provider/workspace.js";
import { CommentService } from "../../api/comment/comment.service.js";

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
    const event =
        c.req.header("X-Forgejo-Event-Type") ||
        c.req.header("X-Gitea-Event-Type") ||
        c.req.header("X-GitHub-Event-Type") ||
        c.req.header("X-Forgejo-Event") ||
        c.req.header("X-Gitea-Event") ||
        c.req.header("X-GitHub-Event") ||
        "";

    const repository = c.get("repository") as Repository;
    const modelProvider = c.get("modelProvider") as ModelProvider;
    const access = c.get("access") as Access;

    const payload = c.get("forgejoPayload") as ForgejoPullRequestPayload | ForgejoIssuesPayload | ForgejoCommentPayload;
    try {
        if (event === "pull_request") {
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
    const prInfo = `#${pr.number} ${pr.title}`;
    if (!repository.prEnabled || !repository.prReviewEnabled) {
        log(`Skipped: review is off (${prInfo})`, "Forgejo");
        return new Response(JSON.stringify({ message: "Skipped: review is off" }), { status: 200 });
    }

    const allowedAction =
        action === "opened" ||
        action === "reopened" ||
        action === "synchronized" ||
        action === "synchronize" ||
        action === "ready_for_review";
    if (!allowedAction) {
        log(`Skipped: action '${action}' (${prInfo})`, "Forgejo");
        return new Response(JSON.stringify({ message: `Skipped: action '${action}'` }), {
            status: 200,
        });
    }

    if (repository.prIgnoreDraft && pr.draft === true && action !== "ready_for_review") {
        log(`Skipped: draft pull request (${prInfo})`, "Forgejo");
        return new Response(JSON.stringify({ message: "Skipped: draft pull request" }), { status: 200 });
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
        false,
        "Skipped: missing author",
    );
    if (accessSkip) return accessSkip;

    const activityService = new ActivityService();
    const prNumber = pr.number;
    const reviewMode = repository.prReviewOnPush;

    let hasCompleted: boolean | null = null;
    if (reviewMode === "on_first_push") {
        hasCompleted = await activityService.hasCompletedPullRequestReview(repository.id, prNumber);
        if (hasCompleted) {
            log(`Skipped: already reviewed (on_first_push) (${prInfo})`, "Forgejo");
            return new Response(JSON.stringify({ message: "Skipped: already reviewed (on_first_push)" }), {
                status: 200,
            });
        }
    }

    const version = await forgejoProvider.fetchPullRequestVersion(prNumber);
    const headSha = pr.head?.sha ?? version.headSha;

    let lastHeadSha: string | null = null;
    if (reviewMode === "on_every_push") {
        lastHeadSha = await activityService.findLastReviewedHeadSha(repository.id, prNumber);
        if (lastHeadSha && lastHeadSha === headSha) {
            log(`Skipped: head already reviewed (${prInfo})`, "Forgejo");
            return new Response(JSON.stringify({ message: "Skipped: head already reviewed" }), { status: 200 });
        }
    }

    if ((await forgejoProvider.fetchPullRequestChangedFileCount(prNumber)) === 0) {
        log(`Skipped: no changed files (${prInfo})`, "Forgejo");
        return new Response(JSON.stringify({ message: "Skipped: no changed files" }), { status: 200 });
    }

    if (hasCompleted === null) {
        hasCompleted = await activityService.hasCompletedPullRequestReview(repository.id, prNumber);
    }
    const isFollowUpReview = hasCompleted;

    runWithActivity(
        {
            repositoryId: repository.id,
            modelProviderId: modelProvider.id,
            modelName: repository.modelName,
            type: "pr_review",
            targetIid: prNumber,
            headSha,
        },
        (activityId) =>
            runPullRequestReview({
                provider: forgejoProvider,
                workspace: new Workspace(forgejoProvider),
                llmSender: createSender({
                    provider: modelProvider.provider,
                    apiKey: modelProvider.apiKey,
                    baseURL: modelProvider.baseUrl,
                    model: repository.modelName,
                }),
                prIid: prNumber,
                isInlineReview: repository.prInlineReview,
                language: repository.language,
                activityId,
                isFollowUpReview,
                previousHeadSha: isFollowUpReview ? lastHeadSha : null,
            }),
    ).catch((error) => {
        logError("Pull request review failed", error, "Forgejo");
    });

    log(`PR review started (${prInfo})`, "Forgejo");
    return new Response(JSON.stringify({ message: "Review started" }), { status: 202 });
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
        false,
        "Skipped: missing author",
    );
    if (accessSkip) return accessSkip;

    runWithActivity(
        {
            repositoryId: repository.id,
            modelProviderId: modelProvider.id,
            modelName: repository.modelName,
            type: "issue_open",
            targetIid: issue.number,
        },
        (activityId) =>
            runIssueReplyOnOpen({
                provider: forgejoProvider,
                workspace: new Workspace(forgejoProvider),
                llmSender: createSender({
                    provider: modelProvider.provider,
                    apiKey: modelProvider.apiKey,
                    baseURL: modelProvider.baseUrl,
                    model: repository.modelName,
                }),
                issueIid: issue.number,
                language: repository.language,
                activityId,
            }),
    ).catch((error) => {
        logError("Issue comment failed", error, "Forgejo");
    });

    log(`Issue comment started (${issueInfo})`, "Forgejo");
    return new Response(JSON.stringify({ message: "Issue comment started" }), { status: 202 });
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

    const accessSkip = await skipIfInsufficientAccess(
        forgejoProvider,
        commenterUsername ? { login: commenterUsername } : null,
        repository.issueMinAccessLevel,
        repository.issueMentionOnly && comment.body.includes(`@${botUsername}`),
        "Skipped: missing user",
    );
    if (accessSkip) return accessSkip;

    const postedComment = await new CommentService().find(repository.id, "comment", comment.id);
    if (postedComment) {
        return new Response(JSON.stringify({ message: "Skipped: own comment" }), { status: 200 });
    }

    runWithActivity(
        {
            repositoryId: repository.id,
            modelProviderId: modelProvider.id,
            modelName: repository.modelName,
            type: "issue_reply",
            targetIid,
        },
        (activityId) =>
            runIssueReply({
                provider: forgejoProvider,
                workspace: new Workspace(forgejoProvider),
                llmSender: createSender({
                    provider: modelProvider.provider,
                    apiKey: modelProvider.apiKey,
                    baseURL: modelProvider.baseUrl,
                    model: repository.modelName,
                }),
                issueIid: targetIid,
                commentId: comment.id,
                language: repository.language,
                activityId,
            }),
    ).catch((error) => {
        logError("Issue reply failed", error, "Forgejo");
    });

    log(`Issue reply started (#${targetIid} comment ${comment.id})`, "Forgejo");
    return new Response(JSON.stringify({ message: "Issue reply started" }), { status: 202 });
};

const handleForgejoReviewedWebhook = async (
    payload: ForgejoCommentPayload,
    repository: Repository,
    modelProvider: ModelProvider,
    access: Access,
) => {
    const prNumber = payload.pull_request?.number;
    const prInfo = `#${prNumber ?? "?"}`;
    if (!prNumber) {
        log("Skipped: missing pull request number", "Forgejo");
        return new Response(JSON.stringify({ message: "Skipped: missing pull request number" }), { status: 200 });
    }

    const reviewType = payload.review?.type;
    if (reviewType !== "comment" && reviewType !== "pull_request_review_comment") {
        log(`Skipped: not a comment review (${prInfo} ${reviewType ?? "missing"})`, "Forgejo");
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
        log(`Skipped: no reply target (${prInfo})`, "Forgejo");
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

    const accessSkip = await skipIfInsufficientAccess(
        forgejoProvider,
        commenterUsername ? { login: commenterUsername } : null,
        repository.prMinAccessLevel,
        repository.prMentionOnly && noteBody.includes(`@${botUsername}`),
        "Skipped: missing user",
    );
    if (accessSkip) return accessSkip;

    runWithActivity(
        {
            repositoryId: repository.id,
            modelProviderId: modelProvider.id,
            modelName: repository.modelName,
            type: "pr_reply",
            targetIid: prNumber,
        },
        (activityId) =>
            runPullRequestReply({
                provider: forgejoProvider,
                workspace: new Workspace(forgejoProvider),
                llmSender: createSender({
                    provider: modelProvider.provider,
                    apiKey: modelProvider.apiKey,
                    baseURL: modelProvider.baseUrl,
                    model: repository.modelName,
                }),
                prIid: prNumber,
                commentId,
                inlineReviewId,
                language: repository.language,
                activityId,
            }),
    ).catch((error) => {
        logError("Pull request reply failed", error, "Forgejo");
    });

    log(
        `PR reply started (#${prNumber} comment ${commentId} ${inlineReviewId ? "inline" : "conversation"})`,
        "Forgejo",
    );
    return new Response(JSON.stringify({ message: "Reply started" }), { status: 202 });
}

async function skipIfInsufficientAccess(
    provider: GitProvider,
    identity: GitUserPermissionIdentity | null,
    minAccessLevel: number,
    mentionBypass: boolean,
    missingMessage: string,
): Promise<Response | null> {
    if (mentionBypass || minAccessLevel <= 0) return null;
    if (identity == null) {
        log(missingMessage, "Forgejo");
        return new Response(JSON.stringify({ message: missingMessage }), { status: 200 });
    }
    let level = 0;
    try {
        level = await provider.fetchUserPermission(identity);
    } catch (error) {
        logError("permission lookup failed", error, "Forgejo");
        return new Response(JSON.stringify({ message: "Skipped: permission lookup failed" }), { status: 200 });
    }
    if (level < minAccessLevel) {
        log(
            `Skipped: insufficient permission (${"login" in identity ? identity.login : String(identity.userId)})`,
            "Forgejo",
        );
        return new Response(JSON.stringify({ message: "Skipped: insufficient permission" }), { status: 200 });
    }
    return null;
}
