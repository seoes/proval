import type {
    WebhookBaseNoteEventSchema,
    WebhookIssueEventSchema,
    WebhookIssueNoteEventSchema,
    WebhookMergeRequestEventSchema,
    WebhookMergeRequestNoteEventSchema,
} from "@gitbeaker/rest";
import type { Context } from "hono";
import { IssueService } from "../../module/issue/issue.service.js";
import { MergeRequestService } from "../../module/merge-request/merge-request.service.js";
import { GitLabProvider } from "../../provider/gitlab.js";
import type { Access, Model, Repository } from "@proval/types";
import { logError } from "../../util/log.js";

export const handleGitLabWebhook = async (c: Context) => {
    const event = c.req.header("X-Gitlab-Event");

    const repository = c.get("repository") as Repository;
    const model = c.get("model") as Model;
    const access = c.get("access") as Access;

    try {
        // Handle Merge Request Hook
        if (event === "Merge Request Hook") {
            const payload: WebhookMergeRequestEventSchema = c.get("gitlabPayload");
            const response = await handleGitLabMergeRequestWebhook(payload, repository, model, access);
            return response;
        }

        if (event === "Issue Hook") {
            const payload: WebhookIssueEventSchema = c.get("gitlabPayload");
            const response = await handleGitLabIssueWebhook(payload, repository, model, access);
            return response;
        }

        // Handle Note Hook
        if (event === "Note Hook") {
            const payload: WebhookBaseNoteEventSchema = c.get("gitlabPayload");
            const noteType = payload.object_attributes?.noteable_type ?? "";

            // Switch on note type
            switch (noteType) {
                case "MergeRequest": {
                    const response = await handleGitLabMergeRequestNoteWebhook(
                        payload as WebhookMergeRequestNoteEventSchema,
                        repository,
                        model,
                        access,
                    );
                    return response;
                }
                case "Issue": {
                    const response = await handleGitLabIssueNoteWebhook(
                        payload as WebhookIssueNoteEventSchema,
                        repository,
                        model,
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
};

type HandleGitLabMergeRequestWebhook = (
    payload: WebhookMergeRequestEventSchema,
    repository: Repository,
    model: Model,
    access: Access,
) => Promise<Response>;

const handleGitLabMergeRequestWebhook: HandleGitLabMergeRequestWebhook = async (payload, repository, model, access) => {
    const project = payload.project;
    const token = access.accessToken;
    if (!token) {
        return new Response(JSON.stringify({ error: "Repository has no GitLab access token" }), {
            status: 500,
        });
    }
    const gitlabProvider = new GitLabProvider(access.baseUrl, token, project.id);

    const mergeRequestService = new MergeRequestService(
        gitlabProvider,
        model.baseUrl,
        model.apiKey,
        model.name,
        repository.language,
    );

    const mergeRequest = payload.object_attributes;

    const action = payload.object_attributes?.action ?? "";

    if (!action) {
        return new Response(JSON.stringify({ message: "No action found" }), { status: 200 });
    }

    if (action !== "open") {
        return new Response(JSON.stringify({ message: `Skipped: action '${action}'` }), {
            status: 200,
        });
    }

    if (!repository.reviewOnMergeRequestOpen) {
        return new Response(JSON.stringify({ message: "Skipped: review is off" }), { status: 200 });
    }

    const reviewOptions = {
        isInlineReview: repository.inlineReview,
        isDeepResearch: repository.deepResearchOnMergeRequest,
    };

    mergeRequestService.review(mergeRequest.iid, reviewOptions);

    return new Response(JSON.stringify({ message: "Review started" }), { status: 202 });
};

type HandleGitLabMergeRequestNoteWebhook = (
    payload: WebhookMergeRequestNoteEventSchema,
    repository: Repository,
    model: Model,
    access: Access,
) => Promise<Response>;

const handleGitLabMergeRequestNoteWebhook: HandleGitLabMergeRequestNoteWebhook = async (
    payload,
    repository,
    model,
    access,
) => {
    // If reply to merge request comment is off, skip
    if (repository.replyToMergeRequestComment === "off") {
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

    const noteBody: string = payload.object_attributes?.note;
    const mrIid = payload.merge_request.iid;

    const mergeRequestService = new MergeRequestService(
        gitlabProvider,
        model.baseUrl,
        model.apiKey,
        model.name,
        repository.language,
    );

    if (repository.replyToMergeRequestComment === "mentioned_only") {
        if (!noteBody.includes(`@${botUsername}`)) {
            return new Response(JSON.stringify({ message: "Skipped: commenter is not mentioned" }), { status: 200 });
        }
    }

    mergeRequestService.reply(mrIid, commenterUsername, noteBody);

    return new Response(JSON.stringify({ message: "Reply started" }), { status: 202 });
};

type HandleGitLabIssueWebhook = (
    payload: WebhookIssueEventSchema,
    repository: Repository,
    model: Model,
    access: Access,
) => Promise<Response>;

const handleGitLabIssueWebhook: HandleGitLabIssueWebhook = async (payload, repository, model, access) => {
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
    const issueService = new IssueService(gitlabProvider, model.baseUrl, model.apiKey, model.name, repository.language);

    issueService.commentOnOpen(issueIid).catch((err) => {
        logError("Issue comment failed", err);
    });

    return new Response(JSON.stringify({ message: "Issue comment started" }), { status: 202 });
};

type HandleGitLabIssueNoteWebhook = (
    payload: WebhookIssueNoteEventSchema,
    repository: Repository,
    model: Model,
    access: Access,
) => Promise<Response>;

const handleGitLabIssueNoteWebhook: HandleGitLabIssueNoteWebhook = async (payload, repository, model, access) => {
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

    const issueService = new IssueService(gitlabProvider, model.baseUrl, model.apiKey, model.name, repository.language);

    issueService.reply(issueIid, commenterUsername, noteBody).catch((err) => {
        logError("Issue reply failed", err);
    });

    return new Response(JSON.stringify({ message: "Issue reply started" }), { status: 202 });
};
