import type { Context } from "hono";
import { App } from "@octokit/app";
import { Octokit } from "@octokit/rest";
import { GitHubProvider } from "../../git-provider/github.js";
import type { GitHubApp, ModelProvider, Repository } from "@proval/types";
import { log, logError } from "../../util/log.js";
import { skipIfInsufficientAccess } from "../../util/webhook-controller.js";
import { ActivityService } from "../../api/activity/activity.service.js";
import { activityQueue } from "../../api/activity/activity.queue.js";
import { triageForReview } from "../../triage/triage.service.js";
import { CommentService } from "../../api/comment/comment.service.js";
import { isAllowedTargetBranch } from "../../util/allowed-target-branch.js";
import { isBotMentioned, shouldSkipReplyWithoutMention } from "../../util/mention.js";
import {
    isPullRequestPushWhileClosed,
    isPullRequestReopenAction,
    skipPullRequestReviewBeforeQueue,
} from "../pull-request-review-guard.js";

type PullRequestWebhookPayload = {
    action?: string;
    pull_request?: {
        number: number;
        title?: string;
        draft?: boolean;
        base?: { ref?: string };
        head?: { sha?: string };
        state?: string;
        user?: { login?: string };
    };
};

type IssueWebhookPayload = {
    action?: string;
    issue?: { number: number; pull_request?: unknown; user?: { login?: string } };
};

type IssueCommentWebhookPayload = {
    action?: string;
    issue?: { pull_request?: unknown; number: number };
    comment?: { id?: number; body?: string };
    sender?: { type?: string; login?: string };
};

type PullRequestReviewCommentWebhookPayload = {
    action?: string;
    pull_request?: { number: number };
    comment?: { id: number; body?: string; in_reply_to_id?: number | null };
    sender?: { type?: string; login?: string };
};

async function createGitHubProvider(
    repository: Repository,
    githubApp: GitHubApp,
    installationId: number,
): Promise<GitHubProvider> {
    const app = new App({
        appId: githubApp.appId,
        privateKey: githubApp.privateKey,
        Octokit,
    });
    const octokit = await app.getInstallationOctokit(installationId);
    if (!octokit) {
        throw new Error("Failed to get installation octokit");
    }

    const { data: repo } = await octokit.request("GET /repositories/:repository_id", {
        repository_id: repository.githubRepositoryId,
    });
    const owner = repo.owner.login;
    const repoName = repo.name;
    const botUsername = `${githubApp.slug}[bot]`;

    return new GitHubProvider(octokit, owner, repoName, botUsername);
}

export const handleGitHubWebhook = async (c: Context) => {
    const event = c.req.header("X-GitHub-Event") ?? "";

    const repository = c.get("repository") as Repository;
    const modelProvider = c.get("modelProvider") as ModelProvider;
    const githubApp = c.get("githubApp") as GitHubApp;
    const githubInstallation = c.get("githubInstallation");

    const installationId = githubInstallation.installationId;

    if (event === "ping") {
        return c.json({ message: "pong" }, 200);
    }

    try {
        if (event === "pull_request") {
            const payload = c.get("githubPayload") as PullRequestWebhookPayload;
            return await handlePullRequestWebhook(payload, repository, modelProvider, githubApp, installationId);
        }

        if (event === "issue_comment") {
            const payload = c.get("githubPayload") as IssueCommentWebhookPayload;
            return await handleIssueCommentWebhook(payload, repository, modelProvider, githubApp, installationId);
        }

        if (event === "pull_request_review_comment") {
            const payload = c.get("githubPayload") as PullRequestReviewCommentWebhookPayload;
            return await handlePullRequestReviewCommentWebhook(
                payload,
                repository,
                modelProvider,
                githubApp,
                installationId,
            );
        }

        if (event === "issues") {
            const payload = c.get("githubPayload") as IssueWebhookPayload;
            return await handleIssueWebhook(payload, repository, modelProvider, githubApp, installationId);
        }

        return c.json({ message: `Unhandled event: ${event}` }, 200);
    } catch (error) {
        logError("GitHub webhook handler failed", error);
        return c.json({ error: "Internal server error" }, 500);
    }
};

async function handlePullRequestWebhook(
    payload: PullRequestWebhookPayload,
    repository: Repository,
    modelProvider: ModelProvider,
    githubApp: GitHubApp,
    installationId: number,
): Promise<Response> {
    const action = payload.action ?? "";
    if (!repository.prEnabled || !repository.prReviewEnabled) {
        return new Response(JSON.stringify({ message: "Skipped: review is off" }), { status: 200 });
    }
    const reviewMode = repository.prReviewOnPush;

    const allowedAction =
        action === "opened" || action === "synchronize" || action === "ready_for_review" || action === "reopened";
    if (!allowedAction) {
        return new Response(JSON.stringify({ message: `Skipped: action '${action}'` }), {
            status: 200,
        });
    }

    const isDraft = payload.pull_request?.draft === true;
    if (repository.prIgnoreDraft && isDraft && action !== "ready_for_review") {
        return new Response(JSON.stringify({ message: "Skipped: draft pull request" }), { status: 200 });
    }

    const prNumber = payload.pull_request?.number;
    if (prNumber === undefined) {
        return new Response(JSON.stringify({ message: "No pull request number" }), { status: 200 });
    }

    const prInfo = `[#${prNumber}]: ${payload.pull_request?.title ?? ""}`;

    const targetBranch = payload.pull_request?.base?.ref ?? "";
    if (!isAllowedTargetBranch(repository.prAllowedTargetBranchList, targetBranch)) {
        const message = `Skipped: target branch '${targetBranch}' is not allowed`;
        log(`${message} - ${prInfo}`, "Github");
        return new Response(JSON.stringify({ message }), { status: 200 });
    }

    const gitHubProvider = await createGitHubProvider(repository, githubApp, installationId);
    const authorLogin = payload.pull_request?.user?.login;
    const accessSkip = await skipIfInsufficientAccess(
        gitHubProvider,
        authorLogin ? { login: authorLogin } : null,
        repository.prMinAccessLevel,
        "Skipped: missing author",
    );
    if (accessSkip) return accessSkip;

    const isReopen = isPullRequestReopenAction(action, "github");
    if (
        isPullRequestPushWhileClosed({
            provider: "github",
            action,
            pullRequestState: payload.pull_request?.state,
        })
    ) {
        return new Response(JSON.stringify({ message: "Skipped: pull request is closed" }), { status: 200 });
    }

    const activityService = new ActivityService();
    const version = await gitHubProvider.fetchPullRequestVersion(prNumber);
    const headSha = payload.pull_request?.head?.sha ?? version.headSha;

    const skipMessage = await skipPullRequestReviewBeforeQueue(activityService, {
        repositoryId: repository.id,
        targetIid: prNumber,
        headSha,
        reviewMode,
        isReopen,
    });
    if (skipMessage) {
        return new Response(JSON.stringify({ message: skipMessage }), { status: 200 });
    }

    const changedFileCount = await gitHubProvider.fetchPullRequestChangedFileCount(prNumber);
    if (changedFileCount === 0) {
        return new Response(JSON.stringify({ message: "Skipped: no changed files" }), { status: 200 });
    }

    // Triage runs on every provider so the record exists; without a versions API it
    // has no delta and classifies the whole pull request from what it can see.
    const triage = await triageForReview({
        provider: gitHubProvider,
        activityService,
        repositoryId: repository.id,
        prIid: prNumber,
        title: (payload.pull_request as { title?: string } | undefined)?.title ?? "",
        author: payload.pull_request?.user?.login ?? "",
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

    return new Response(JSON.stringify({ message: "Review queued" }), { status: 202 });
}

async function handleIssueWebhook(
    payload: IssueWebhookPayload,
    repository: Repository,
    modelProvider: ModelProvider,
    githubApp: GitHubApp,
    installationId: number,
): Promise<Response> {
    const action = payload.action ?? "";
    if (action !== "opened") {
        return new Response(JSON.stringify({ message: `Skipped: action '${action}'` }), {
            status: 200,
        });
    }

    if (!repository.issueEnabled || !repository.issueCommentOnOpenEnabled) {
        return new Response(JSON.stringify({ message: "Skipped: issue comment on open is off" }), {
            status: 200,
        });
    }

    if (payload.issue?.pull_request) {
        return new Response(JSON.stringify({ message: "Skipped: pull request issue payload" }), {
            status: 200,
        });
    }

    const issueNumber = payload.issue?.number;
    if (issueNumber === undefined) {
        return new Response(JSON.stringify({ message: "No issue number" }), { status: 200 });
    }

    const gitHubProvider = await createGitHubProvider(repository, githubApp, installationId);
    const authorLogin = payload.issue?.user?.login;
    const accessSkip = await skipIfInsufficientAccess(
        gitHubProvider,
        authorLogin ? { login: authorLogin } : null,
        repository.issueMinAccessLevel,
        "Skipped: missing author",
    );
    if (accessSkip) return accessSkip;

    await activityQueue.push({
        repositoryId: repository.id,
        modelProviderId: modelProvider.id,
        modelName: repository.modelName,
        type: "issue_open",
        targetIid: issueNumber,
    });
    activityQueue.drain();

    return new Response(JSON.stringify({ message: "Issue comment queued" }), { status: 202 });
}

async function handleIssueCommentWebhook(
    payload: IssueCommentWebhookPayload,
    repository: Repository,
    modelProvider: ModelProvider,
    githubApp: GitHubApp,
    installationId: number,
): Promise<Response> {
    const action = payload.action ?? "";
    if (action !== "created") {
        return new Response(JSON.stringify({ message: `Skipped: action '${action}'` }), {
            status: 200,
        });
    }

    const issueNumber = payload.issue?.number;
    if (issueNumber === undefined) {
        return new Response(JSON.stringify({ message: "No issue number" }), { status: 200 });
    }

    const sender = payload.sender;
    const gitHubProvider = await createGitHubProvider(repository, githubApp, installationId);
    const botUsername = (await gitHubProvider.fetchCurrentUser()).username;

    if (sender?.type === "Bot") {
        return new Response(JSON.stringify({ message: "Skipped: bot sender" }), { status: 200 });
    }

    const noteBody = payload.comment?.body ?? "";
    const commentId = payload.comment?.id;
    if (commentId === undefined) {
        return new Response(JSON.stringify({ message: "No comment id" }), { status: 200 });
    }
    const postedComment = await new CommentService().find(repository.id, "comment", commentId);
    if (postedComment) {
        return new Response(JSON.stringify({ message: "Skipped: own comment" }), { status: 200 });
    }

    if (payload.issue?.pull_request) {
        if (!repository.prEnabled || !repository.prReplyEnabled) {
            return new Response(JSON.stringify({ message: "Reply mode is off" }), { status: 200 });
        }

        const mentioned = isBotMentioned(noteBody, [botUsername, githubApp.slug]);
        if (shouldSkipReplyWithoutMention(repository.prMentionOnly, mentioned)) {
            return new Response(JSON.stringify({ message: "Skipped: bot not mentioned" }), { status: 200 });
        }
        const senderLogin = sender?.login;
        const accessSkip = await skipIfInsufficientAccess(
            gitHubProvider,
            senderLogin ? { login: senderLogin } : null,
            repository.prMinAccessLevel,
            "Skipped: missing user",
        );
        if (accessSkip) return accessSkip;

        await activityQueue.push({
            repositoryId: repository.id,
            modelProviderId: modelProvider.id,
            modelName: repository.modelName,
            type: "pr_reply",
            targetIid: issueNumber,
            targetCommentId: commentId,
        });
        activityQueue.drain();

        return new Response(JSON.stringify({ message: "Reply queued" }), { status: 202 });
    }

    if (!repository.issueEnabled || !repository.issueReplyEnabled) {
        return new Response(JSON.stringify({ message: "Issue reply mode is off" }), {
            status: 200,
        });
    }

    const mentioned = isBotMentioned(noteBody, [botUsername, githubApp.slug]);
    if (shouldSkipReplyWithoutMention(repository.issueMentionOnly, mentioned)) {
        return new Response(JSON.stringify({ message: "Skipped: bot not mentioned" }), { status: 200 });
    }
    const senderLogin = sender?.login;
    const accessSkip = await skipIfInsufficientAccess(
        gitHubProvider,
        senderLogin ? { login: senderLogin } : null,
        repository.issueMinAccessLevel,
        "Skipped: missing user",
    );
    if (accessSkip) return accessSkip;

    await activityQueue.push({
        repositoryId: repository.id,
        modelProviderId: modelProvider.id,
        modelName: repository.modelName,
        type: "issue_reply",
        targetIid: issueNumber,
        targetCommentId: commentId,
    });
    activityQueue.drain();

    return new Response(JSON.stringify({ message: "Issue reply queued" }), { status: 202 });
}

async function handlePullRequestReviewCommentWebhook(
    payload: PullRequestReviewCommentWebhookPayload,
    repository: Repository,
    modelProvider: ModelProvider,
    githubApp: GitHubApp,
    installationId: number,
): Promise<Response> {
    const action = payload.action ?? "";
    if (action !== "created") {
        return new Response(JSON.stringify({ message: `Skipped: action '${action}'` }), { status: 200 });
    }

    const prNumber = payload.pull_request?.number;
    const comment = payload.comment;
    if (prNumber === undefined || !comment?.id) {
        return new Response(JSON.stringify({ message: "Missing pull request or comment" }), { status: 200 });
    }

    const sender = payload.sender;
    const gitHubProvider = await createGitHubProvider(repository, githubApp, installationId);
    const botUsername = (await gitHubProvider.fetchCurrentUser()).username;

    if (sender?.type === "Bot") {
        return new Response(JSON.stringify({ message: "Skipped: bot sender" }), { status: 200 });
    }

    const postedComment = await new CommentService().find(repository.id, "inline_review", comment.id);
    if (postedComment) {
        return new Response(JSON.stringify({ message: "Skipped: own comment" }), { status: 200 });
    }

    if (!repository.prEnabled || !repository.prReplyEnabled) {
        return new Response(JSON.stringify({ message: "Reply mode is off" }), { status: 200 });
    }

    const noteBody = comment.body ?? "";
    const mentioned = isBotMentioned(noteBody, [botUsername, githubApp.slug]);
    if (shouldSkipReplyWithoutMention(repository.prMentionOnly, mentioned)) {
        return new Response(JSON.stringify({ message: "Skipped: bot not mentioned" }), { status: 200 });
    }
    const senderLogin = sender?.login;
    const accessSkip = await skipIfInsufficientAccess(
        gitHubProvider,
        senderLogin ? { login: senderLogin } : null,
        repository.prMinAccessLevel,
        "Skipped: missing user",
    );
    if (accessSkip) return accessSkip;

    const inlineReviewId = String(comment.in_reply_to_id ?? comment.id);
    await activityQueue.push({
        repositoryId: repository.id,
        modelProviderId: modelProvider.id,
        modelName: repository.modelName,
        type: "pr_reply",
        targetIid: prNumber,
        targetCommentId: comment.id,
        targetInlineReviewId: inlineReviewId,
    });
    activityQueue.drain();

    return new Response(JSON.stringify({ message: "Reply queued" }), { status: 202 });
}
