import type {
    DiscussionNoteSchema,
    MergeRequestNoteSchema,
    WebhookBaseNoteEventSchema,
    WebhookIssueEventSchema,
    WebhookIssueNoteEventSchema,
    WebhookMergeRequestEventSchema,
    WebhookMergeRequestNoteEventSchema,
} from "@gitbeaker/rest";
import type { Context } from "hono";
import { GitLabProvider } from "../../git-provider/gitlab.js";
import type { Access, ModelProvider, Repository } from "@proval/types";
import { log, logError } from "../../util/log.js";
import { isBotMentioned, shouldSkipReplyWithoutMention } from "../../util/mention.js";
import { isAllowedTargetBranch } from "../../util/allowed-target-branch.js";
import { skipIfInsufficientAccess } from "../../util/webhook-controller.js";
import { ActivityService } from "../../api/activity/activity.service.js";
import { activityQueue } from "../../api/activity/activity.queue.js";
import { triageForReview } from "../../triage/triage.service.js";
import { CommentService } from "../../api/comment/comment.service.js";
import {
    isPullRequestPushWhileClosed,
    isPullRequestReopenAction,
    skipPullRequestReviewBeforeQueue,
} from "../pull-request-review-guard.js";

export const handleGitLabWebhook = async (c: Context) => {
    const event = c.req.header("X-Gitlab-Event");

    const repository = c.get("repository") as Repository;
    const modelProvider = c.get("modelProvider") as ModelProvider;
    const access = c.get("access") as Access;

    try {
        // Handle Merge Request Hook (GitLab event name)
        if (event === "Merge Request Hook") {
            const payload: WebhookMergeRequestEventSchema = c.get("gitlabPayload");
            const response = await handleGitLabPullRequestWebhook(payload, repository, modelProvider, access);
            return response;
        }

        if (event === "Issue Hook") {
            const payload: WebhookIssueEventSchema = c.get("gitlabPayload");
            const response = await handleGitLabIssueWebhook(payload, repository, modelProvider, access);
            return response;
        }

        // Handle Note Hook
        if (event === "Note Hook") {
            const payload: WebhookBaseNoteEventSchema = c.get("gitlabPayload");
            const noteType = payload.object_attributes?.noteable_type ?? "";

            // Switch on note type
            switch (noteType) {
                case "MergeRequest": {
                    const response = await handleGitLabPullRequestNoteWebhook(
                        payload as WebhookMergeRequestNoteEventSchema,
                        repository,
                        modelProvider,
                        access,
                    );
                    return response;
                }
                case "Issue": {
                    const response = await handleGitLabIssueNoteWebhook(
                        payload as WebhookIssueNoteEventSchema,
                        repository,
                        modelProvider,
                        access,
                    );
                    return response;
                }
                default: {
                    return c.json({ message: `Skipped: note type is not supported` }, 200);
                }
            }
        }
    } catch (error) {
        logError("GitLab webhook handler failed", error);
        return c.json({ error: "Internal server error" }, 500);
    }

    return c.json({ message: `Skipped: event '${event}' is not supported` }, 200);
};

type HandleGitLabPullRequestWebhook = (
    payload: WebhookMergeRequestEventSchema,
    repository: Repository,
    modelProvider: ModelProvider,
    access: Access,
) => Promise<Response>;

const handleGitLabPullRequestWebhook: HandleGitLabPullRequestWebhook = async (
    payload,
    repository,
    modelProvider,
    access,
) => {
    const project = payload.project;
    const token = repository.accessToken;
    if (!token) {
        return new Response(JSON.stringify({ error: "Repository has no GitLab access token" }), {
            status: 500,
        });
    }

    const reviewMode = repository.prReviewOnPush;
    if (!repository.prEnabled || !repository.prReviewEnabled) {
        return new Response(JSON.stringify({ message: "Skipped: review is off" }), { status: 200 });
    }

    const pullRequest = payload.object_attributes;
    const action = pullRequest?.action ?? "";
    if (!action) {
        return new Response(JSON.stringify({ message: "No action found" }), { status: 200 });
    }

    const isDraft = Boolean(
        (pullRequest as { draft?: boolean; work_in_progress?: boolean }).draft ||
        (pullRequest as { draft?: boolean; work_in_progress?: boolean }).work_in_progress,
    );
    const oldrev = (pullRequest as { oldrev?: string | null }).oldrev;
    const hasPush = typeof oldrev === "string" && oldrev.length > 0;
    const changes = (payload as { changes?: { draft?: { previous?: boolean; current?: boolean } } }).changes;
    const becameReady = changes?.draft?.previous === true && changes?.draft?.current === false;

    const allowedAction = action === "open" || action === "reopen" || (action === "update" && (hasPush || becameReady));
    if (!allowedAction) {
        return new Response(JSON.stringify({ message: `Skipped: action '${action}'` }), {
            status: 200,
        });
    }

    if (repository.prIgnoreDraft && isDraft && !becameReady) {
        return new Response(JSON.stringify({ message: "Skipped: draft merge request" }), { status: 200 });
    }

    const prInfo = `[!${pullRequest.iid}]: ${(pullRequest as { title?: string }).title ?? ""}`;

    const targetBranch = (pullRequest as { target_branch?: string }).target_branch ?? "";
    if (!isAllowedTargetBranch(repository.prAllowedTargetBranchList, targetBranch)) {
        const message = `Skipped: target branch '${targetBranch}' is not allowed`;
        log(`${message} - ${prInfo}`, "GitLab");
        return new Response(JSON.stringify({ message }), { status: 200 });
    }

    const gitlabProvider = new GitLabProvider(access.baseUrl, token, project.id);
    const authorId = (pullRequest as { author_id?: number }).author_id;
    const accessSkip = await skipIfInsufficientAccess(
        gitlabProvider,
        authorId == null ? null : { userId: authorId },
        repository.prMinAccessLevel,
        "Skipped: missing author",
    );
    if (accessSkip) return accessSkip;

    const isReopen = isPullRequestReopenAction(action, "gitlab");
    const pullRequestState = (pullRequest as { state?: string }).state;
    if (
        isPullRequestPushWhileClosed({
            provider: "gitlab",
            action,
            pullRequestState,
        })
    ) {
        return new Response(JSON.stringify({ message: "Skipped: pull request is closed" }), { status: 200 });
    }

    const activityService = new ActivityService();
    const prIid = pullRequest.iid;

    const version = await gitlabProvider.fetchPullRequestVersion(prIid);
    const headSha = (pullRequest as { last_commit?: { id?: string } }).last_commit?.id ?? version.headSha;

    const skipMessage = await skipPullRequestReviewBeforeQueue(activityService, {
        repositoryId: repository.id,
        targetIid: prIid,
        headSha,
        reviewMode,
        isReopen,
    });
    if (skipMessage) {
        return new Response(JSON.stringify({ message: skipMessage }), { status: 200 });
    }

    const changedFileCount = await gitlabProvider.fetchPullRequestChangedFileCount(prIid);
    if (changedFileCount === 0) {
        return new Response(JSON.stringify({ message: "Skipped: no changed files" }), { status: 200 });
    }

    // Triage decides how deep this review should be before any token is spent. The
    // record is always written to the activity; it only changes the depth when the
    // repository has opted in, and a skip answers like every other guard above.
    // The webhook's top level user is whoever triggered the event, not the merge
    // request's author, and the mechanical-author rule needs the latter.
    const detail = await gitlabProvider.fetchPullRequestDetail(prIid);
    const triage = await triageForReview({
        provider: gitlabProvider,
        activityService,
        repositoryId: repository.id,
        prIid,
        title: (pullRequest as { title?: string }).title ?? detail.title,
        author: detail.author,
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
        targetIid: prIid,
        headSha,
        triage: triage.record,
    });
    activityQueue.drain();

    return new Response(JSON.stringify({ message: "Review queued" }), { status: 202 });
};

type HandleGitLabPullRequestNoteWebhook = (
    payload: WebhookMergeRequestNoteEventSchema,
    repository: Repository,
    modelProvider: ModelProvider,
    access: Access,
) => Promise<Response>;

const handleGitLabPullRequestNoteWebhook: HandleGitLabPullRequestNoteWebhook = async (
    payload,
    repository,
    modelProvider,
    access,
) => {
    // If reply to pull request comment is off, skip
    if (!repository.prEnabled || !repository.prReplyEnabled) {
        return new Response(JSON.stringify({ message: "Reply mode is off, skipping" }), {
            status: 200,
        });
    }

    const action = (payload.object_attributes as unknown as MergeRequestNoteSchema).action;
    if (!action || action !== "create") {
        log(`Skipped: action '${action}'`);
        return new Response(JSON.stringify({ message: `Skipped: action '${action}'` }), {
            status: 200,
        });
    }

    const project = payload.project;
    const token = repository.accessToken;
    if (!token) {
        return new Response(JSON.stringify({ error: "Repository has no GitLab access token" }), {
            status: 500,
        });
    }
    const gitlabProvider = new GitLabProvider(access.baseUrl, token, project.id);

    const botUserData = await gitlabProvider.fetchCurrentUser();
    const botUsername = botUserData.username;

    const commentId = payload.object_attributes?.id;
    if (commentId == null) {
        return new Response(JSON.stringify({ message: "No comment id found" }), { status: 200 });
    }
    const isInlineReviewComment = (payload.object_attributes as unknown as DiscussionNoteSchema).type === "DiffNote";
    const postedComment = await new CommentService().find(
        repository.id,
        isInlineReviewComment ? "inline_review" : "comment",
        commentId,
    );
    if (postedComment) {
        return new Response(JSON.stringify({ message: "Skipped: own comment" }), { status: 200 });
    }

    const noteBody: string = payload.object_attributes?.note;
    const mentioned = isBotMentioned(noteBody, [botUsername]);
    if (shouldSkipReplyWithoutMention(repository.prMentionOnly, mentioned)) {
        return new Response(JSON.stringify({ message: "Skipped: bot not mentioned" }), { status: 200 });
    }
    const commenterId = payload.user?.id;
    const accessSkip = await skipIfInsufficientAccess(
        gitlabProvider,
        commenterId == null ? null : { userId: commenterId },
        repository.prMinAccessLevel,
        "Skipped: missing user",
    );
    if (accessSkip) return accessSkip;

    const prIid = payload.merge_request.iid;

    const inlineReviewId = isInlineReviewComment ? (payload.object_attributes.discussion_id ?? null) : null;

    await activityQueue.push({
        repositoryId: repository.id,
        modelProviderId: modelProvider.id,
        modelName: repository.modelName,
        type: "pr_reply",
        targetIid: prIid,
        targetCommentId: commentId,
        targetInlineReviewId: inlineReviewId,
    });
    activityQueue.drain();

    return new Response(JSON.stringify({ message: "Reply queued" }), { status: 202 });
};

type HandleGitLabIssueWebhook = (
    payload: WebhookIssueEventSchema,
    repository: Repository,
    modelProvider: ModelProvider,
    access: Access,
) => Promise<Response>;

const handleGitLabIssueWebhook: HandleGitLabIssueWebhook = async (payload, repository, modelProvider, access) => {
    const action = payload.object_attributes?.action ?? "";
    if (action !== "open") {
        return new Response(JSON.stringify({ message: `Skipped: action '${action}'` }), {
            status: 200,
        });
    }

    if (!repository.issueEnabled || !repository.issueCommentOnOpenEnabled) {
        return new Response(JSON.stringify({ message: "Skipped: issue comment on open is off" }), {
            status: 200,
        });
    }

    const project = payload.project;
    const token = repository.accessToken;
    if (!token) {
        return new Response(JSON.stringify({ error: "Repository has no GitLab access token" }), {
            status: 500,
        });
    }

    const issueIid = payload.object_attributes?.iid;
    if (issueIid == null) {
        return new Response(JSON.stringify({ message: "No issue IID found" }), { status: 200 });
    }

    const gitlabProvider = new GitLabProvider(access.baseUrl, token, project.id);
    const authorId = payload.object_attributes?.author_id;
    const accessSkip = await skipIfInsufficientAccess(
        gitlabProvider,
        authorId == null ? null : { userId: authorId },
        repository.issueMinAccessLevel,
        "Skipped: missing author",
    );
    if (accessSkip) return accessSkip;

    await activityQueue.push({
        repositoryId: repository.id,
        modelProviderId: modelProvider.id,
        modelName: repository.modelName,
        type: "issue_open",
        targetIid: issueIid,
    });
    activityQueue.drain();

    return new Response(JSON.stringify({ message: "Issue comment queued" }), { status: 202 });
};

type HandleGitLabIssueNoteWebhook = (
    payload: WebhookIssueNoteEventSchema,
    repository: Repository,
    modelProvider: ModelProvider,
    access: Access,
) => Promise<Response>;

const handleGitLabIssueNoteWebhook: HandleGitLabIssueNoteWebhook = async (
    payload,
    repository,
    modelProvider,
    access,
) => {
    // If reply to issue comment is off, skip
    if (!repository.issueEnabled || !repository.issueReplyEnabled) {
        return new Response(JSON.stringify({ message: "Reply mode is off, skipping" }), {
            status: 200,
        });
    }

    const action = (payload.object_attributes as unknown as MergeRequestNoteSchema).action;
    if (!action || action !== "create") {
        return new Response(JSON.stringify({ message: `Skipped: action '${action}'` }), {
            status: 200,
        });
    }

    const project = payload.project;
    const token = repository.accessToken;
    if (!token) {
        return new Response(JSON.stringify({ error: "Repository has no GitLab access token" }), {
            status: 500,
        });
    }
    const gitlabProvider = new GitLabProvider(access.baseUrl, token, project.id);

    const botUserData = await gitlabProvider.fetchCurrentUser();
    const botUsername = botUserData.username;

    const noteBody: string = payload.object_attributes?.note ?? "";
    const commentId = payload.object_attributes?.id;
    const issueIid = payload.issue?.iid;
    if (issueIid == null) {
        return new Response(JSON.stringify({ message: "No issue IID found" }), { status: 200 });
    }

    if (commentId == null) {
        return new Response(JSON.stringify({ message: "No comment id found" }), { status: 200 });
    }

    const postedComment = await new CommentService().find(repository.id, "comment", commentId);
    if (postedComment) {
        return new Response(JSON.stringify({ message: "Skipped: own comment" }), { status: 200 });
    }

    const mentioned = isBotMentioned(noteBody, [botUsername]);
    if (shouldSkipReplyWithoutMention(repository.issueMentionOnly, mentioned)) {
        return new Response(JSON.stringify({ message: "Skipped: bot not mentioned" }), { status: 200 });
    }
    const commenterId = payload.user?.id;
    const accessSkip = await skipIfInsufficientAccess(
        gitlabProvider,
        commenterId == null ? null : { userId: commenterId },
        repository.issueMinAccessLevel,
        "Skipped: missing user",
    );
    if (accessSkip) return accessSkip;

    await activityQueue.push({
        repositoryId: repository.id,
        modelProviderId: modelProvider.id,
        modelName: repository.modelName,
        type: "issue_reply",
        targetIid: issueIid,
        targetCommentId: commentId,
    });
    activityQueue.drain();

    return new Response(JSON.stringify({ message: "Issue reply queued" }), { status: 202 });
};
