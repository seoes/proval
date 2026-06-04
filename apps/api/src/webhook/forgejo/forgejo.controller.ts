import type { Context } from "hono";
import { IssueService } from "../../module/issue/issue.service.js";
import { PullRequestService } from "../../module/pull-request/pull-request.service.js";
import { ForgejoProvider } from "../../provider/forgejo.js";
import type { Access, Model, Repository } from "@proval/types";
import { logError } from "../../util/log.js";
import { runWithActivity } from "../../api/activity/activity.runner.js";

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
    const event = c.req.header("X-Forgejo-Event") ?? c.req.header("X-Gitea-Event");

    const repository = c.get("repository") as Repository;
    const model = c.get("model") as Model;
    const access = c.get("access") as Access;

    try {
        // Handle Pull Request Hook
        if (event === "pull_request") {
            const payload = c.get("forgejoPayload") as ForgejoPullRequestPayload;
            const response = await handleForgejoPullRequestWebhook(payload, repository, model, access);
            return response;
        }

        // Handle Issues Hook
        if (event === "issues") {
            const payload = c.get("forgejoPayload") as ForgejoIssuesPayload;
            const response = await handleForgejoIssuesWebhook(payload, repository, model, access);
            return response;
        }

        // Handle Issue Comment Hook (includes PR comments)
        if (event === "issue_comment") {
            const payload = c.get("forgejoPayload") as ForgejoIssueCommentPayload;
            const response = await handleForgejoIssueCommentWebhook(payload, repository, model, access);
            return response;
        }

        return c.json({ message: `Skipped: event '${event}' is not supported` }, 200);
    } catch (error) {
        logError("Forgejo webhook handler failed", error);
        return c.json({ error: "Internal server error" }, 500);
    }
};

type HandleForgejoPullRequestWebhook = (
    payload: ForgejoPullRequestPayload,
    repository: Repository,
    model: Model,
    access: Access,
) => Promise<Response>;

const handleForgejoPullRequestWebhook: HandleForgejoPullRequestWebhook = async (payload, repository, model, access) => {
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

    const pullRequestService = new PullRequestService(
        forgejoProvider,
        { provider: model.provider, apiKey: model.apiKey, baseURL: model.baseUrl, model: model.name },
        repository.language,
    );

    const prNumber = payload.pull_request.number;

    const reviewOptions = {
        isInlineReview: repository.inlineReview,
        isDeepResearch: repository.deepResearchOnPullRequest,
    };

    runWithActivity(
        {
            repositoryId: repository.id,
            modelId: model.id,
            type: "pr_review",
            targetIid: prNumber,
        },
        () => pullRequestService.review(prNumber, reviewOptions),
    ).catch((error) => {
        logError("Pull request review failed", error);
    });

    return new Response(JSON.stringify({ message: "Review started" }), { status: 202 });
};

type HandleForgejoIssueCommentWebhook = (
    payload: ForgejoIssueCommentPayload,
    repository: Repository,
    model: Model,
    access: Access,
) => Promise<Response>;

const handleForgejoIssueCommentWebhook: HandleForgejoIssueCommentWebhook = async (
    payload,
    repository,
    model,
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

        const pullRequestService = new PullRequestService(
            forgejoProvider,
            { provider: model.provider, apiKey: model.apiKey, baseURL: model.baseUrl, model: model.name },
            repository.language,
        );

        runWithActivity(
            {
                repositoryId: repository.id,
                modelId: model.id,
                type: "pr_reply",
                targetIid: prNumber,
            },
            () => pullRequestService.reply(prNumber, commenterUsername, noteBody),
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
        const issueNumber = payload.issue.number;

        if (repository.replyToIssueComment === "mentioned_only" && !noteBody.includes(`@${botUsername}`)) {
            return new Response(JSON.stringify({ message: "Skipped: bot username is not mentioned" }), { status: 200 });
        }

        const issueService = new IssueService(
            forgejoProvider,
            { provider: model.provider, apiKey: model.apiKey, baseURL: model.baseUrl, model: model.name },
            repository.language,
        );

        runWithActivity(
            {
                repositoryId: repository.id,
                modelId: model.id,
                type: "issue_reply",
                targetIid: issueNumber,
            },
            () => issueService.reply(issueNumber, commenterUsername, noteBody),
        ).catch((error) => {
            logError("Issue reply failed", error);
        });

        return new Response(JSON.stringify({ message: "Issue reply started" }), { status: 202 });
    }
};

type HandleForgejoIssuesWebhook = (
    payload: ForgejoIssuesPayload,
    repository: Repository,
    model: Model,
    access: Access,
) => Promise<Response>;

const handleForgejoIssuesWebhook: HandleForgejoIssuesWebhook = async (payload, repository, model, access) => {
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
    const issueService = new IssueService(
        forgejoProvider,
        { provider: model.provider, apiKey: model.apiKey, baseURL: model.baseUrl, model: model.name },
        repository.language,
    );

    runWithActivity(
        {
            repositoryId: repository.id,
            modelId: model.id,
            type: "issue_open",
            targetIid: issueNumber,
        },
        () => issueService.commentOnOpen(issueNumber),
    ).catch((error) => {
        logError("Issue comment failed", error);
    });

    return new Response(JSON.stringify({ message: "Issue comment started" }), { status: 202 });
};
