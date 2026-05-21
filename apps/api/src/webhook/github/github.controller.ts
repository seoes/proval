import type { Context } from "hono";
import { App } from "@octokit/app";
import { Octokit } from "@octokit/rest";
import { IssueService } from "../../module/issue/issue.service.js";
import { MergeRequestService } from "../../module/merge-request/merge-request.service.js";
import { GitHubProvider } from "../../provider/github.js";
import { githubAppTable, modelTable, repositoryTable } from "@code-review/db";
import type { InferSelectModel } from "drizzle-orm";
import { logError } from "../../util/log.js";

type Repository = InferSelectModel<typeof repositoryTable>;
type Model = InferSelectModel<typeof modelTable>;
type GithubApp = InferSelectModel<typeof githubAppTable>;

type PullRequestWebhookPayload = {
    action?: string;
    pull_request?: { number: number };
};

type IssueWebhookPayload = {
    action?: string;
    issue?: { number: number; pull_request?: unknown };
};

type IssueCommentWebhookPayload = {
    action?: string;
    issue?: { pull_request?: unknown; number: number };
    comment?: { body?: string };
    sender?: { type?: string; login?: string };
};

async function createGitHubProvider(
    repository: Repository,
    githubApp: GithubApp,
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
        repository_id: repository.githubRepositoryId!,
    });
    const owner = repo.owner.login;
    const repoName = repo.name;
    const botUsername = `${githubApp.slug}[bot]`;

    return new GitHubProvider(octokit, owner, repoName, botUsername);
}

export const handleGitHubWebhook = async (c: Context) => {
    const event = c.req.header("X-GitHub-Event") ?? "";

    const repository = c.get("repository") as Repository;
    const model = c.get("model") as Model;
    const githubApp = c.get("githubApp") as GithubApp;
    const githubInstallation = c.get("githubInstallation");

    const installationId = githubInstallation.installationId;

    if (event === "ping") {
        return c.json({ message: "pong" }, 200);
    }

    try {
        if (event === "pull_request") {
            const payload = c.get("githubPayload") as PullRequestWebhookPayload;
            return await handlePullRequestWebhook(payload, repository, model, githubApp, installationId);
        }

        if (event === "issue_comment") {
            const payload = c.get("githubPayload") as IssueCommentWebhookPayload;
            return await handleIssueCommentWebhook(payload, repository, model, githubApp, installationId);
        }

        if (event === "issues") {
            const payload = c.get("githubPayload") as IssueWebhookPayload;
            return await handleIssueWebhook(payload, repository, model, githubApp, installationId);
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
    model: Model,
    githubApp: GithubApp,
    installationId: number,
): Promise<Response> {
    const action = payload.action ?? "";
    if (action !== "opened") {
        return new Response(JSON.stringify({ message: `Skipped: action '${action}'` }), { status: 200 });
    }

    if (!repository.reviewOnMergeRequestOpen) {
        return new Response(JSON.stringify({ message: "Skipped: review is off" }), { status: 200 });
    }

    const prNumber = payload.pull_request?.number;
    if (prNumber == null) {
        return new Response(JSON.stringify({ message: "No pull request number" }), { status: 200 });
    }

    const gitHubProvider = await createGitHubProvider(repository, githubApp, installationId);
    const mergeRequestService = new MergeRequestService(
        gitHubProvider,
        model.baseUrl,
        model.apiKey,
        model.name,
        repository.language,
        repository.inlineReview,
    );

    if (repository.deepResearchOnMergeRequest) {
        mergeRequestService
            .planDeepReview(prNumber)
            .then((targets) => mergeRequestService.generateDeepReview(prNumber, targets))
            .catch((err) => logError("Deep review failed", err));
    } else {
        mergeRequestService.generateStandardReview(prNumber).catch((err) => logError("Review failed", err));
    }

    return new Response(JSON.stringify({ message: "Review started" }), { status: 202 });
}

async function handleIssueWebhook(
    payload: IssueWebhookPayload,
    repository: Repository,
    model: Model,
    githubApp: GithubApp,
    installationId: number,
): Promise<Response> {
    const action = payload.action ?? "";
    if (action !== "opened") {
        return new Response(JSON.stringify({ message: `Skipped: action '${action}'` }), { status: 200 });
    }

    if (!repository.commentOnIssueOpen) {
        return new Response(JSON.stringify({ message: "Skipped: issue comment on open is off" }), { status: 200 });
    }

    if (payload.issue?.pull_request) {
        return new Response(JSON.stringify({ message: "Skipped: pull request issue payload" }), { status: 200 });
    }

    const issueNumber = payload.issue?.number;
    if (issueNumber == null) {
        return new Response(JSON.stringify({ message: "No issue number" }), { status: 200 });
    }

    const gitHubProvider = await createGitHubProvider(repository, githubApp, installationId);
    const issueService = new IssueService(
        gitHubProvider,
        model.baseUrl,
        model.apiKey,
        model.name,
        repository.language,
    );

    issueService.commentOnOpen(issueNumber).catch((err) => logError("Issue comment failed", err));

    return new Response(JSON.stringify({ message: "Issue comment started" }), { status: 202 });
}

async function handleIssueCommentWebhook(
    payload: IssueCommentWebhookPayload,
    repository: Repository,
    model: Model,
    githubApp: GithubApp,
    installationId: number,
): Promise<Response> {
    const action = payload.action ?? "";
    if (action !== "created") {
        return new Response(JSON.stringify({ message: `Skipped: action '${action}'` }), { status: 200 });
    }

    const issueNumber = payload.issue?.number;
    if (issueNumber == null) {
        return new Response(JSON.stringify({ message: "No issue number" }), { status: 200 });
    }

    const sender = payload.sender;
    const gitHubProvider = await createGitHubProvider(repository, githubApp, installationId);
    const botLogin = (await gitHubProvider.fetchCurrentUser()).username;

    if (sender?.type === "Bot" || sender?.login === botLogin) {
        return new Response(JSON.stringify({ message: "Skipped: bot sender" }), { status: 200 });
    }

    const noteBody = payload.comment?.body ?? "";
    const commenterUsername = sender?.login ?? "";

    if (payload.issue?.pull_request) {
        if (repository.replyToMergeRequestComment === "off") {
            return new Response(JSON.stringify({ message: "Reply mode is off" }), { status: 200 });
        }

        if (
            repository.replyToMergeRequestComment === "mentioned_only" &&
            !isBotMentioned(noteBody, botLogin, githubApp.slug)
        ) {
            return new Response(JSON.stringify({ message: "Skipped: bot not mentioned" }), { status: 200 });
        }

        const mergeRequestService = new MergeRequestService(
            gitHubProvider,
            model.baseUrl,
            model.apiKey,
            model.name,
            repository.language,
            repository.inlineReview,
        );

        mergeRequestService
            .reply(issueNumber, commenterUsername, noteBody)
            .catch((err) => logError("Reply failed", err));

        return new Response(JSON.stringify({ message: "Reply started" }), { status: 202 });
    }

    if (repository.replyToIssueComment === "off") {
        return new Response(JSON.stringify({ message: "Issue reply mode is off" }), { status: 200 });
    }

    if (repository.replyToIssueComment === "mentioned_only" && !isBotMentioned(noteBody, botLogin, githubApp.slug)) {
        return new Response(JSON.stringify({ message: "Skipped: bot not mentioned" }), { status: 200 });
    }

    const issueService = new IssueService(gitHubProvider, model.baseUrl, model.apiKey, model.name, repository.language);

    issueService.reply(issueNumber, commenterUsername, noteBody).catch((err) => logError("Reply failed", err));

    return new Response(JSON.stringify({ message: "Issue reply started" }), { status: 202 });
}

function isBotMentioned(noteBody: string, botUsername: string, appSlug: string): boolean {
    return noteBody.includes(`@${botUsername}`) || noteBody.includes(`@${appSlug}`);
}
