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
import { runWithActivity } from "../../api/activity/activity.runner.js";
import { createSender } from "../../agent/llm/factory.js";
import { runPullRequestReply, runPullRequestReview } from "../../agent/pull-request";
import { runIssueCommentOnOpen, runIssueReply } from "../../agent/issue";

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
    const token = access.accessToken;
    if (!token) {
        return new Response(JSON.stringify({ error: "Repository has no GitLab access token" }), {
            status: 500,
        });
    }
    const gitlabProvider = new GitLabProvider(access.baseUrl, token, project.id);

    const llmSender = createSender({
        provider: modelProvider.provider,
        apiKey: modelProvider.apiKey,
        baseURL: modelProvider.baseUrl,
        model: repository.modelName,
    });

    const pullRequest = payload.object_attributes;

    const action = payload.object_attributes?.action ?? "";

    if (!action) {
        return new Response(JSON.stringify({ message: "No action found" }), { status: 200 });
    }

    if (action !== "open") {
        return new Response(JSON.stringify({ message: `Skipped: action '${action}'` }), {
            status: 200,
        });
    }

    if (!repository.reviewOnPullRequestOpen) {
        return new Response(JSON.stringify({ message: "Skipped: review is off" }), { status: 200 });
    }

    const isInlineReview = repository.inlineReview;
    const isDeepResearch = repository.deepResearchOnPullRequest;

    runWithActivity(
        {
            repositoryId: repository.id,
            modelProviderId: modelProvider.id,
            modelName: repository.modelName,
            type: "pr_review",
            targetIid: pullRequest.iid,
        },
        () =>
            runPullRequestReview({
                provider: gitlabProvider,
                llmSender,
                prIid: pullRequest.iid,
                isInlineReview,
                isDeepResearch,
                language: repository.language,
            }),
    ).catch((error) => {
        logError("Pull request review failed", error);
    });

    return new Response(JSON.stringify({ message: "Review started" }), { status: 202 });
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
    if (repository.replyToPullRequestComment === "off") {
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
    const commenterUsername: string = payload.user?.username ?? "";

    if (botUsername === commenterUsername) {
        log("Skipped: bot username is the same as the commenter username, skipping");
        return new Response(
            JSON.stringify({
                message: "Skipped: bot username is the same as the commenter username, skipping",
            }),
            { status: 200 },
        );
    }

    const noteBody: string = payload.object_attributes?.note;
    const commentId = payload.object_attributes?.id;
    const prIid = payload.merge_request.iid;

    const llmSender = createSender({
        provider: modelProvider.provider,
        apiKey: modelProvider.apiKey,
        baseURL: modelProvider.baseUrl,
        model: repository.modelName,
    });

    if (repository.replyToPullRequestComment === "mentioned_only") {
        if (!noteBody.includes(`@${botUsername}`)) {
            return new Response(JSON.stringify({ message: "Skipped: commenter is not mentioned" }), { status: 200 });
        }
    }

    const isInlineReviewComment = (payload.object_attributes as unknown as DiscussionNoteSchema).type === "DiffNote";
    const reviewId = payload.object_attributes.discussion_id ?? null;

    runWithActivity(
        {
            repositoryId: repository.id,
            modelProviderId: modelProvider.id,
            modelName: repository.modelName,
            type: "pr_reply",
            targetIid: prIid,
        },
        () =>
            runPullRequestReply({
                provider: gitlabProvider,
                llmSender,
                prIid,
                commentId,
                reviewId: isInlineReviewComment ? reviewId : null,
                language: repository.language,
            }),
    ).catch((error) => {
        logError("Pull request reply failed", error);
    });

    return new Response(JSON.stringify({ message: "Reply started" }), { status: 202 });
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

    if (!repository.commentOnIssueOpen) {
        return new Response(JSON.stringify({ message: "Skipped: issue comment on open is off" }), {
            status: 200,
        });
    }

    const project = payload.project;
    const token = access.accessToken;
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
    const llmSender = createSender({
        provider: modelProvider.provider,
        apiKey: modelProvider.apiKey,
        baseURL: modelProvider.baseUrl,
        model: repository.modelName,
    });

    runWithActivity(
        {
            repositoryId: repository.id,
            modelProviderId: modelProvider.id,
            modelName: repository.modelName,
            type: "issue_open",
            targetIid: issueIid,
        },
        () => runIssueCommentOnOpen(gitlabProvider, llmSender, issueIid, repository.language),
    ).catch((error) => {
        logError("Issue comment failed", error);
    });

    return new Response(JSON.stringify({ message: "Issue comment started" }), { status: 202 });
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
    if (repository.replyToIssueComment === "off") {
        return new Response(JSON.stringify({ message: "Reply mode is off, skipping" }), {
            status: 200,
        });
    }

    const project = payload.project;
    const token = access.accessToken;
    if (!token) {
        return new Response(JSON.stringify({ error: "Repository has no GitLab access token" }), {
            status: 500,
        });
    }
    const gitlabProvider = new GitLabProvider(access.baseUrl, token, project.id);

    const botUserData = await gitlabProvider.fetchCurrentUser();
    const botUsername = botUserData.username;
    const commenterUsername: string = payload.user?.username ?? "";
    if (botUsername === commenterUsername) {
        return new Response(
            JSON.stringify({
                message: "Skipped: bot username is the same as the commenter username, skipping",
            }),
            { status: 200 },
        );
    }

    const noteBody: string = payload.object_attributes?.note ?? "";
    const issueIid = payload.issue?.iid;
    if (issueIid == null) {
        return new Response(JSON.stringify({ message: "No issue IID found" }), { status: 200 });
    }

    if (repository.replyToIssueComment === "mentioned_only" && !noteBody.includes(`@${botUsername}`)) {
        return new Response(JSON.stringify({ message: "Skipped: bot username is not mentioned" }), {
            status: 200,
        });
    }

    const llmSender = createSender({
        provider: modelProvider.provider,
        apiKey: modelProvider.apiKey,
        baseURL: modelProvider.baseUrl,
        model: repository.modelName,
    });

    runWithActivity(
        {
            repositoryId: repository.id,
            modelProviderId: modelProvider.id,
            modelName: repository.modelName,
            type: "issue_reply",
            targetIid: issueIid,
        },
        () => runIssueReply(gitlabProvider, llmSender, issueIid, commenterUsername, noteBody, repository.language),
    ).catch((error) => {
        logError("Issue reply failed", error);
    });

    return new Response(JSON.stringify({ message: "Issue reply started" }), { status: 202 });
};
