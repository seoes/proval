import type { Context } from "hono";
import { App } from "@octokit/app";
import { Octokit } from "@octokit/rest";
import { GitHubProvider } from "../../git-provider/github.js";
import type { GitHubApp, ModelProvider, Repository } from "@proval/types";
import { logError } from "../../util/log.js";
import { skipIfInsufficientAccess } from "../../util/webhook-controller.js";
import { runWithActivity } from "../../api/activity/activity.runner.js";
import { ActivityService } from "../../api/activity/activity.service.js";
import { createSender } from "../../agent/llm/factory.js";
import { runPullRequestReply, runPullRequestReview } from "../../agent/pull-request";
import { runIssueReplyOnOpen, runIssueReply } from "../../agent/issue";
import { Workspace } from "../../git-provider/workspace.js";
import { CommentService } from "../../api/comment/comment.service.js";
import { isBotMentioned, shouldSkipReplyWithoutMention } from "../../util/mention.js";

type PullRequestWebhookPayload = {
    action?: string;
    pull_request?: {
        number: number;
        draft?: boolean;
        head?: { sha?: string };
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

    const gitHubProvider = await createGitHubProvider(repository, githubApp, installationId);
    const authorLogin = payload.pull_request?.user?.login;
    const accessSkip = await skipIfInsufficientAccess(
        gitHubProvider,
        authorLogin ? { login: authorLogin } : null,
        repository.prMinAccessLevel,
        "Skipped: missing author",
    );
    if (accessSkip) return accessSkip;

    const activityService = new ActivityService();
    let hasCompleted: boolean | null = null;
    if (reviewMode === "on_first_push") {
        hasCompleted = await activityService.hasCompletedPullRequestReview(repository.id, prNumber);
        if (hasCompleted) {
            return new Response(JSON.stringify({ message: "Skipped: already reviewed (on_first_push)" }), {
                status: 200,
            });
        }
    }

    const version = await gitHubProvider.fetchPullRequestVersion(prNumber);
    const headSha = payload.pull_request?.head?.sha ?? version.headSha;

    let lastHeadSha: string | null = null;
    if (reviewMode === "on_every_push") {
        lastHeadSha = await activityService.findLastReviewedHeadSha(repository.id, prNumber);
        if (lastHeadSha && lastHeadSha === headSha) {
            return new Response(JSON.stringify({ message: "Skipped: head already reviewed" }), { status: 200 });
        }
    }

    const changedFileCount = await gitHubProvider.fetchPullRequestChangedFileCount(prNumber);
    if (changedFileCount === 0) {
        return new Response(JSON.stringify({ message: "Skipped: no changed files" }), { status: 200 });
    }

    if (hasCompleted === null) {
        hasCompleted = await activityService.hasCompletedPullRequestReview(repository.id, prNumber);
    }
    const isFollowUpReview = hasCompleted;

    const llmSender = createSender({
        provider: modelProvider.provider,
        apiKey: modelProvider.apiKey,
        baseURL: modelProvider.baseUrl,
        model: repository.modelName,
        timeoutSecond: modelProvider.timeoutSecond,
    });

    const isInlineReview = repository.prInlineReview;

    const workspace = new Workspace(gitHubProvider);
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
                provider: gitHubProvider,
                workspace,
                llmSender,
                prIid: prNumber,
                isInlineReview,
                language: repository.language,
                activityId,
                isFollowUpReview,
                previousHeadSha: isFollowUpReview ? lastHeadSha : null,
            }),
    ).catch((error) => {
        logError("Pull request review failed", error);
    });

    return new Response(JSON.stringify({ message: "Review started" }), { status: 202 });
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

    const llmSender = createSender({
        provider: modelProvider.provider,
        apiKey: modelProvider.apiKey,
        baseURL: modelProvider.baseUrl,
        model: repository.modelName,
        timeoutSecond: modelProvider.timeoutSecond,
    });

    const workspace = new Workspace(gitHubProvider);
    runWithActivity(
        {
            repositoryId: repository.id,
            modelProviderId: modelProvider.id,
            modelName: repository.modelName,
            type: "issue_open",
            targetIid: issueNumber,
        },
        (activityId) =>
            runIssueReplyOnOpen({
                provider: gitHubProvider,
                workspace,
                llmSender,
                issueIid: issueNumber,
                language: repository.language,
                issueLabelOnOpenEnabled: repository.issueLabelOnOpenEnabled,
                activityId,
            }),
    ).catch((error) => {
        logError("Issue comment failed", error);
    });

    return new Response(JSON.stringify({ message: "Issue comment started" }), { status: 202 });
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

        const llmSender = createSender({
            provider: modelProvider.provider,
            apiKey: modelProvider.apiKey,
            baseURL: modelProvider.baseUrl,
            model: repository.modelName,
            timeoutSecond: modelProvider.timeoutSecond,
        });

        const workspace = new Workspace(gitHubProvider);
        runWithActivity(
            {
                repositoryId: repository.id,
                modelProviderId: modelProvider.id,
                modelName: repository.modelName,
                type: "pr_reply",
                targetIid: issueNumber,
            },
            (activityId) =>
                runPullRequestReply({
                    provider: gitHubProvider,
                    workspace,
                    llmSender,
                    prIid: issueNumber,
                    commentId,
                    inlineReviewId: null,
                    language: repository.language,
                    activityId,
                }),
        ).catch((error) => {
            logError("Pull request reply failed", error);
        });

        return new Response(JSON.stringify({ message: "Reply started" }), { status: 202 });
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

    const llmSender = createSender({
        provider: modelProvider.provider,
        apiKey: modelProvider.apiKey,
        baseURL: modelProvider.baseUrl,
        model: repository.modelName,
        timeoutSecond: modelProvider.timeoutSecond,
    });

    const workspace = new Workspace(gitHubProvider);
    runWithActivity(
        {
            repositoryId: repository.id,
            modelProviderId: modelProvider.id,
            modelName: repository.modelName,
            type: "issue_reply",
            targetIid: issueNumber,
        },
        (activityId) =>
            runIssueReply({
                provider: gitHubProvider,
                workspace,
                llmSender,
                issueIid: issueNumber,
                commentId,
                language: repository.language,
                activityId,
            }),
    ).catch((error) => {
        logError("Issue reply failed", error);
    });

    return new Response(JSON.stringify({ message: "Issue reply started" }), { status: 202 });
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
    const llmSender = createSender({
        provider: modelProvider.provider,
        apiKey: modelProvider.apiKey,
        baseURL: modelProvider.baseUrl,
        model: repository.modelName,
        timeoutSecond: modelProvider.timeoutSecond,
    });

    const workspace = new Workspace(gitHubProvider);
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
                provider: gitHubProvider,
                workspace,
                llmSender,
                prIid: prNumber,
                commentId: comment.id,
                inlineReviewId,
                language: repository.language,
                activityId,
            }),
    ).catch((error) => {
        logError("Pull request inline review reply failed", error);
    });

    return new Response(JSON.stringify({ message: "Reply started" }), { status: 202 });
}
