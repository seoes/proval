import type { Context } from "hono";
import { ForgejoProvider } from "../../git-provider/forgejo.js";
import type { Access, ModelProvider, Repository } from "@proval/types";
import { logError } from "../../util/log.js";
import { runWithActivity } from "../../api/activity/activity.runner.js";
import { createSender } from "../../agent/llm/factory.js";
import { runPullRequestReply, runPullRequestReview } from "../../agent/pull-request";
import { runIssueReplyOnOpen, runIssueReply } from "../../agent/issue";
import { Workspace } from "../../git-provider/workspace.js";

// Forgejo webhook payload types
interface ForgejoPullRequestPayload {
    action: string;
    number: number;
    pull_request: {
        number: number;
        title: string;
        body: string | null;
        state: string;
        merged: boolean;
    };
    repository: {
        id: number;
        full_name: string;
        owner: { login: string };
        name: string;
    };
}

interface ForgejoIssueCommentPayload {
    action: string;
    issue: {
        number: number;
        pull_request?: { url: string } | null;
    };
    comment: {
        id: number;
        body: string;
        user: { login: string };
    };
    repository: {
        id: number;
        full_name: string;
        owner: { login: string };
        name: string;
    };
}

interface ForgejoPullRequestReviewCommentPayload {
    action: string;
    number: number;
    pull_request: {
        number: number;
    };
    review: {
        type: string;
        comments?: Array<{
            id: number;
            body: string;
            user: { login: string };
            in_reply_to?: number | null;
            path?: string | null;
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

interface ForgejoPullRequestCommentPayload {
    action: string;
    issue?: { number: number };
    pull_request: {
        number: number;
    };
    comment: {
        id: number;
        body: string;
        user: { login: string };
        path?: string | null;
        in_reply_to?: number | null;
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
    };
    repository: {
        id: number;
        full_name: string;
        owner: { login: string };
        name: string;
    };
}

export const handleForgejoWebhook = async (c: Context) => {
    const event = resolveForgejoWebhookEvent(c);

    const repository = c.get("repository") as Repository;
    const modelProvider = c.get("modelProvider") as ModelProvider;
    const access = c.get("access") as Access;

    try {
        // Handle Pull Request Hook
        if (event === "pull_request") {
            const payload = c.get("forgejoPayload") as ForgejoPullRequestPayload;
            const response = await handleForgejoPullRequestWebhook(payload, repository, modelProvider, access);
            return response;
        }

        // Handle Issues Hook
        if (event === "issues") {
            const payload = c.get("forgejoPayload") as ForgejoIssuesPayload;
            const response = await handleForgejoIssuesWebhook(payload, repository, modelProvider, access);
            return response;
        }

        // Handle Issue Comment Hook (includes PR conversation comments)
        if (event === "issue_comment") {
            const payload = c.get("forgejoPayload") as ForgejoIssueCommentPayload;
            const response = await handleForgejoIssueCommentWebhook(payload, repository, modelProvider, access);
            return response;
        }

        if (event === "pull_request_review_comment") {
            const payload = c.get("forgejoPayload") as ForgejoPullRequestReviewCommentPayload;
            const response = await handleForgejoPullRequestReviewCommentWebhook(
                payload,
                repository,
                modelProvider,
                access,
            );
            return response;
        }

        if (event === "pull_request_comment") {
            const payload = c.get("forgejoPayload") as ForgejoPullRequestCommentPayload;
            const response = await handleForgejoPullRequestCommentWebhook(payload, repository, modelProvider, access);
            return response;
        }

        return c.json({ message: `Skipped: event '${event}' is not supported` }, 200);
    } catch (error) {
        logError("Forgejo webhook handler failed", error);
        return c.json({ error: "Internal server error" }, 500);
    }
};

function resolveForgejoWebhookEvent(c: Context): string {
    const eventType = c.req.header("X-Gitea-Event-Type") ?? c.req.header("X-GitHub-Event-Type");
    if (eventType === "pull_request_review_comment") return "pull_request_review_comment";
    if (eventType === "pull_request_comment") return "pull_request_comment";
    return c.req.header("X-Forgejo-Event") ?? c.req.header("X-Gitea-Event") ?? "";
}

type HandleForgejoPullRequestWebhook = (
    payload: ForgejoPullRequestPayload,
    repository: Repository,
    modelProvider: ModelProvider,
    access: Access,
) => Promise<Response>;

const handleForgejoPullRequestWebhook: HandleForgejoPullRequestWebhook = async (
    payload,
    repository,
    modelProvider,
    access,
) => {
    const action = payload.action;

    if (!repository.reviewOnPullRequestOpen) {
        return new Response(JSON.stringify({ message: "Skipped: review is off" }), { status: 200 });
    }

    if (action !== "opened" && action !== "reopened") {
        return new Response(JSON.stringify({ message: `Skipped: action '${action}'` }), {
            status: 200,
        });
    }

    const token = access.accessToken;

    if (!token) {
        return new Response(JSON.stringify({ error: "Repository has no access token" }), {
            status: 500,
        });
    }

    const [owner, repo] = payload.repository.full_name.split("/");
    const forgejoProvider = new ForgejoProvider(access.baseUrl, token, owner, repo);

    const llmSender = createSender({
        provider: modelProvider.provider,
        apiKey: modelProvider.apiKey,
        baseURL: modelProvider.baseUrl,
        model: repository.modelName,
    });

    const prNumber = payload.pull_request.number;

    const isInlineReview = repository.inlineReview;
    const language = repository.language;

    const workspace = new Workspace(forgejoProvider);
    runWithActivity(
        {
            repositoryId: repository.id,
            modelProviderId: modelProvider.id,
            modelName: repository.modelName,
            type: "pr_review",
            targetIid: prNumber,
        },
        () =>
            runPullRequestReview({
                provider: forgejoProvider,
                workspace,
                llmSender,
                prIid: prNumber,
                isInlineReview,
                language,
            }),
    ).catch((error) => {
        logError("Pull request review failed", error);
    });

    return new Response(JSON.stringify({ message: "Review started" }), { status: 202 });
};

type HandleForgejoIssueCommentWebhook = (
    payload: ForgejoIssueCommentPayload,
    repository: Repository,
    modelProvider: ModelProvider,
    access: Access,
) => Promise<Response>;

const handleForgejoIssueCommentWebhook: HandleForgejoIssueCommentWebhook = async (
    payload,
    repository,
    modelProvider,
    access,
) => {
    if (payload.action !== "created") {
        return new Response(JSON.stringify({ message: `Skipped: action '${payload.action}'` }), {
            status: 200,
        });
    }

    const isPullRequest = payload.issue.pull_request !== null && payload.issue.pull_request !== undefined;

    if (isPullRequest) {
        // Handle PR comment
        if (repository.replyToPullRequestComment === "off") {
            return new Response(JSON.stringify({ message: "Reply mode is off, skipping" }), {
                status: 200,
            });
        }

        const token = access.accessToken;
        if (!token) {
            return new Response(JSON.stringify({ error: "Repository has no access token" }), {
                status: 500,
            });
        }

        const [owner, repo] = payload.repository.full_name.split("/");
        const forgejoProvider = new ForgejoProvider(access.baseUrl, token, owner, repo);

        const botUserData = await forgejoProvider.fetchCurrentUser();
        const botUsername = botUserData.username;
        const commenterUsername = payload.comment.user.login;

        if (botUsername === commenterUsername) {
            return new Response(
                JSON.stringify({
                    message: "Skipped: bot username is the same as the commenter username",
                }),
                { status: 200 },
            );
        }

        const noteBody = payload.comment.body;
        const prNumber = payload.issue.number;

        if (repository.replyToPullRequestComment === "mentioned_only") {
            if (!noteBody.includes(`@${botUsername}`)) {
                return new Response(JSON.stringify({ message: "Skipped: bot username is not mentioned" }), {
                    status: 200,
                });
            }
        }

        const llmSender = createSender({
            provider: modelProvider.provider,
            apiKey: modelProvider.apiKey,
            baseURL: modelProvider.baseUrl,
            model: repository.modelName,
        });

        const workspace = new Workspace(forgejoProvider);
        runWithActivity(
            {
                repositoryId: repository.id,
                modelProviderId: modelProvider.id,
                modelName: repository.modelName,
                type: "pr_reply",
                targetIid: prNumber,
            },
            () =>
                runPullRequestReply({
                    provider: forgejoProvider,
                    workspace,
                    llmSender,
                    prIid: prNumber,
                    commentId: payload.comment.id,
                    inlineReviewId: null,
                    language: repository.language,
                }),
        ).catch((error) => {
            logError("Pull request reply failed", error);
        });

        return new Response(JSON.stringify({ message: "Reply started" }), { status: 202 });
    } else {
        // Handle Issue comment
        if (repository.replyToIssueComment === "off") {
            return new Response(JSON.stringify({ message: "Reply mode is off, skipping" }), {
                status: 200,
            });
        }

        const token = access.accessToken;
        if (!token) {
            return new Response(JSON.stringify({ error: "Repository has no access token" }), {
                status: 500,
            });
        }

        const [owner, repo] = payload.repository.full_name.split("/");
        const forgejoProvider = new ForgejoProvider(access.baseUrl, token, owner, repo);

        const botUserData = await forgejoProvider.fetchCurrentUser();
        const botUsername = botUserData.username;
        const commenterUsername = payload.comment.user.login;

        if (botUsername === commenterUsername) {
            return new Response(
                JSON.stringify({
                    message: "Skipped: bot username is the same as the commenter username",
                }),
                { status: 200 },
            );
        }

        const noteBody = payload.comment.body;
        const commentId = payload.comment.id;
        const issueNumber = payload.issue.number;

        if (repository.replyToIssueComment === "mentioned_only" && !noteBody.includes(`@${botUsername}`)) {
            return new Response(JSON.stringify({ message: "Skipped: bot username is not mentioned" }), { status: 200 });
        }

        const llmSender = createSender({
            provider: modelProvider.provider,
            apiKey: modelProvider.apiKey,
            baseURL: modelProvider.baseUrl,
            model: repository.modelName,
        });

        const workspace = new Workspace(forgejoProvider);
        runWithActivity(
            {
                repositoryId: repository.id,
                modelProviderId: modelProvider.id,
                modelName: repository.modelName,
                type: "issue_reply",
                targetIid: issueNumber,
            },
            () =>
                runIssueReply({
                    provider: forgejoProvider,
                    workspace,
                    llmSender,
                    issueIid: issueNumber,
                    commentId,
                    language: repository.language,
                }),
        ).catch((error) => {
            logError("Issue reply failed", error);
        });

        return new Response(JSON.stringify({ message: "Issue reply started" }), { status: 202 });
    }
};

type HandleForgejoIssuesWebhook = (
    payload: ForgejoIssuesPayload,
    repository: Repository,
    modelProvider: ModelProvider,
    access: Access,
) => Promise<Response>;

const handleForgejoIssuesWebhook: HandleForgejoIssuesWebhook = async (payload, repository, modelProvider, access) => {
    const action = payload.action;
    if (action !== "opened") {
        return new Response(JSON.stringify({ message: `Skipped: action '${action}'` }), {
            status: 200,
        });
    }

    if (!repository.commentOnIssueOpen) {
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

    const issueNumber = payload.issue.number;
    if (!issueNumber) {
        return new Response(JSON.stringify({ message: "No issue number found" }), { status: 200 });
    }

    const [owner, repo] = payload.repository.full_name.split("/");
    const forgejoProvider = new ForgejoProvider(access.baseUrl, token, owner, repo);
    const llmSender = createSender({
        provider: modelProvider.provider,
        apiKey: modelProvider.apiKey,
        baseURL: modelProvider.baseUrl,
        model: repository.modelName,
    });

    const workspace = new Workspace(forgejoProvider);
    runWithActivity(
        {
            repositoryId: repository.id,
            modelProviderId: modelProvider.id,
            modelName: repository.modelName,
            type: "issue_open",
            targetIid: issueNumber,
        },
        () =>
            runIssueReplyOnOpen({
                provider: forgejoProvider,
                workspace,
                llmSender,
                issueIid: issueNumber,
                language: repository.language,
            }),
    ).catch((error) => {
        logError("Issue comment failed", error);
    });

    return new Response(JSON.stringify({ message: "Issue comment started" }), { status: 202 });
};

const handleForgejoPullRequestReviewCommentWebhook = async (
    payload: ForgejoPullRequestReviewCommentPayload,
    repository: Repository,
    modelProvider: ModelProvider,
    access: Access,
): Promise<Response> => {
    if (payload.action !== "reviewed") {
        return new Response(JSON.stringify({ message: `Skipped: action '${payload.action}'` }), { status: 200 });
    }

    if (payload.review.type !== "comment") {
        return new Response(JSON.stringify({ message: "Skipped: not a comment review" }), { status: 200 });
    }

    const comments = payload.review.comments ?? [];
    const triggerComment = comments.at(-1);
    if (!triggerComment) {
        return new Response(JSON.stringify({ message: "No review comments in payload" }), { status: 200 });
    }

    return handleForgejoInlineReviewReplyWebhook({
        prNumber: payload.pull_request.number,
        commentId: triggerComment.id,
        inlineReviewId: String(triggerComment.in_reply_to ?? triggerComment.id),
        noteBody: triggerComment.body,
        commenterUsername: triggerComment.user.login,
        repository,
        modelProvider,
        access,
        repositoryPayload: payload.repository,
        senderLogin: payload.sender?.login,
    });
};

const handleForgejoPullRequestCommentWebhook = async (
    payload: ForgejoPullRequestCommentPayload,
    repository: Repository,
    modelProvider: ModelProvider,
    access: Access,
): Promise<Response> => {
    if (payload.action !== "created") {
        return new Response(JSON.stringify({ message: `Skipped: action '${payload.action}'` }), { status: 200 });
    }

    if (!payload.comment.path) {
        return new Response(JSON.stringify({ message: "Skipped: not an inline review comment" }), { status: 200 });
    }

    return handleForgejoInlineReviewReplyWebhook({
        prNumber: payload.pull_request.number,
        commentId: payload.comment.id,
        inlineReviewId: String(payload.comment.in_reply_to ?? payload.comment.id),
        noteBody: payload.comment.body,
        commenterUsername: payload.comment.user.login,
        repository,
        modelProvider,
        access,
        repositoryPayload: payload.repository,
    });
};

type ForgejoInlineReviewReplyParams = {
    prNumber: number;
    commentId: number;
    inlineReviewId: string;
    noteBody: string;
    commenterUsername: string;
    repository: Repository;
    modelProvider: ModelProvider;
    access: Access;
    repositoryPayload: { full_name: string };
    senderLogin?: string;
};

const handleForgejoInlineReviewReplyWebhook = async (
    params: ForgejoInlineReviewReplyParams,
): Promise<Response> => {
    const {
        prNumber,
        commentId,
        inlineReviewId,
        noteBody,
        commenterUsername,
        repository,
        modelProvider,
        access,
        repositoryPayload,
        senderLogin,
    } = params;

    if (repository.replyToPullRequestComment === "off") {
        return new Response(JSON.stringify({ message: "Reply mode is off" }), { status: 200 });
    }

    const token = access.accessToken;
    if (!token) {
        return new Response(JSON.stringify({ error: "Repository has no access token" }), { status: 500 });
    }

    const [owner, repo] = repositoryPayload.full_name.split("/");
    const forgejoProvider = new ForgejoProvider(access.baseUrl, token, owner, repo);

    const botUsername = (await forgejoProvider.fetchCurrentUser()).username;

    if (botUsername === commenterUsername || senderLogin === botUsername) {
        return new Response(JSON.stringify({ message: "Skipped: bot sender" }), { status: 200 });
    }

    if (repository.replyToPullRequestComment === "mentioned_only" && !noteBody.includes(`@${botUsername}`)) {
        return new Response(JSON.stringify({ message: "Skipped: bot not mentioned" }), { status: 200 });
    }

    const llmSender = createSender({
        provider: modelProvider.provider,
        apiKey: modelProvider.apiKey,
        baseURL: modelProvider.baseUrl,
        model: repository.modelName,
    });

    const workspace = new Workspace(forgejoProvider);
    runWithActivity(
        {
            repositoryId: repository.id,
            modelProviderId: modelProvider.id,
            modelName: repository.modelName,
            type: "pr_reply",
            targetIid: prNumber,
        },
        () =>
            runPullRequestReply({
                provider: forgejoProvider,
                workspace,
                llmSender,
                prIid: prNumber,
                commentId,
                inlineReviewId,
                language: repository.language,
            }),
    ).catch((error) => {
        logError("Pull request inline review reply failed", error);
    });

    return new Response(JSON.stringify({ message: "Reply started" }), { status: 202 });
};
