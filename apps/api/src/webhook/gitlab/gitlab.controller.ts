import type {
    WebhookBaseNoteEventSchema,
    WebhookMergeRequestEventSchema,
    WebhookMergeRequestNoteEventSchema,
} from "@gitbeaker/rest";
import type { Context } from "hono";
import { MergeRequestService } from "../../module/merge-request/merge-request.service.js";
import { GitLabProvider } from "../../provider/gitlab.js";
import { modelTable, repositoryTable } from "@code-review/db";
import { type InferSelectModel } from "drizzle-orm";

type Repository = InferSelectModel<typeof repositoryTable>;
type Model = InferSelectModel<typeof modelTable>;

export const handleGitLabWebhook = async (c: Context) => {
    const event = c.req.header("X-Gitlab-Event");

    const repository = c.get("repository") as Repository;
    const model = c.get("model") as Model;

    console.log("--------------------------------");
    console.log(`GitLab Webhook received: ${event}`);
    console.log("Repository:", repository.name);
    console.log("Model:", model.name);
    console.log("Inline Review:", repository.inlineReview);
    console.log("Deep Research:", repository.deepResearchOnMergeRequest);
    console.log("Review On Merge Request Open:", repository.reviewOnMergeRequestOpen);
    console.log("Reply To Merge Request Comment:", repository.replyToMergeRequestComment);
    console.log("--------------------------------");

    try {
        // Handle Merge Request Hook
        if (event === "Merge Request Hook") {
            const payload: WebhookMergeRequestEventSchema = c.get("gitlabPayload");
            const response = await handleGitLabMergeRequestWebhook(payload, repository, model);
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
                    );
                    return response;
                }
                default: {
                    return c.json({ message: `Skipped: note type is not supported` }, 200);
                }
            }
        }
    } catch (error) {
        console.error(error);
        return c.json({ error: "Internal server error" }, 500);
    }
};

type HandleGitLabMergeRequestWebhook = (
    payload: WebhookMergeRequestEventSchema,
    repository: Repository,
    model: Model,
) => Promise<Response>;

const handleGitLabMergeRequestWebhook: HandleGitLabMergeRequestWebhook = async (payload, repository, model) => {
    const project = payload.project;
    const gitlabProvider = new GitLabProvider(repository.baseUrl, repository.apiToken, project.id);

    const mergeRequestService = new MergeRequestService(
        gitlabProvider,
        model.baseUrl,
        model.apiKey,
        model.name,
        repository.language,
        repository.inlineReview,
    );

    const mergeRequest = payload.object_attributes;

    const action = payload.object_attributes?.action ?? "";

    if (!action) {
        return new Response(JSON.stringify({ message: "No action found" }), { status: 200 });
    }

    switch (action) {
        case "open": {
            // If review is off, skip
            if (!repository.reviewOnMergeRequestOpen) {
                return new Response(JSON.stringify({ message: "Skipped: review is off" }), { status: 200 });
            }

            // If review is on, review the merge request
            if (repository.deepResearchOnMergeRequest) {
                mergeRequestService
                    .planDeepReview(mergeRequest.iid)
                    .then((reviewTargetList) => mergeRequestService.generateDeepReview(mergeRequest.iid, reviewTargetList))
                    .catch((err) => {
                        console.error("Deep review failed:", err);
                    });
            } else {
                mergeRequestService.generateStandardReview(mergeRequest.iid).catch((err) => {
                    console.error("Review failed:", err);
                });
            }
            return new Response(JSON.stringify({ message: "Review started" }), { status: 202 });
        }
        case "update": {
        }
        case "reopen": {
        }
        case "close": {
        }
        default: {
            return new Response(JSON.stringify({ message: `Skipped: action '${action}'` }), { status: 200 });
        }
    }
};

type HandleGitLabMergeRequestNoteWebhook = (
    payload: WebhookMergeRequestNoteEventSchema,
    repository: Repository,
    model: Model,
) => Promise<Response>;

const handleGitLabMergeRequestNoteWebhook: HandleGitLabMergeRequestNoteWebhook = async (payload, repository, model) => {
    // If reply to merge request comment is off, skip
    if (repository.replyToMergeRequestComment === "off") {
        return new Response(JSON.stringify({ message: "Reply mode is off, skipping" }), { status: 200 });
    }

    const project = payload.project;
    const gitlabProvider = new GitLabProvider(repository.baseUrl, repository.apiToken, project.id);

    const botUserData = await gitlabProvider.fetchCurrentUser();
    const botUsername = botUserData.username;
    const commenterUsername: string = payload.user?.username ?? "";

    if (botUsername === commenterUsername) {
        return new Response(
            JSON.stringify({ message: "Skipped: bot username is the same as the commenter username, skipping" }),
            { status: 200 },
        );
    }

    const noteBody: string = payload.object_attributes?.note;
    const mrIid = payload.merge_request.iid;

    console.log("--------------------------------");
    console.log("New Comment on Merge Request");
    console.log("Comment Body:", noteBody);
    console.log("Commenter Username:", commenterUsername);
    console.log("Merge Request IID:", mrIid);
    console.log("Reply To Merge Request Comment:", repository.replyToMergeRequestComment);
    console.log("--------------------------------");

    const mergeRequestService = new MergeRequestService(
        gitlabProvider,
        model.baseUrl,
        model.apiKey,
        model.name,
        repository.language,
        repository.inlineReview,
    );

    if (repository.replyToMergeRequestComment === "mentioned_only") {
        if (!noteBody.includes(`@${botUsername}`)) {
            console.log("Skipped: bot username is not mentioned");
            return new Response(JSON.stringify({ message: "Skipped: commenter is not mentioned" }), { status: 200 });
        }
    }

    mergeRequestService.reply(mrIid, commenterUsername, noteBody).catch((err) => {
        console.error("Reply failed:", err);
    });
    return new Response(JSON.stringify({ message: "Reply started" }), { status: 202 });
};
