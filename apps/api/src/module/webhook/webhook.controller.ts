import type { MergeRequestSchema, ProjectSchema } from "@gitbeaker/rest";
import type { Context } from "hono";
import { MergeRequestService } from "../merge-request/merge-request.service.js";
import { GitLabProvider } from "../../provider/gitlab.js";
import { llmConfigTable, repositoryTable } from "../../db/schema.js";
import { type InferSelectModel } from "drizzle-orm";

const REVIEWABLE_MR_ACTIONS = ["open", "reopen", "update"];

export const handleGitLabWebhook = async (c: Context) => {
    const event = c.req.header("X-Gitlab-Event");
    const payload = await c.req.json();

    console.log("payload", JSON.stringify(payload, null, 2));

    const repository = c.get("repository") as InferSelectModel<typeof repositoryTable>;
    const llm = c.get("llm") as InferSelectModel<typeof llmConfigTable>;

    const project = payload.project as ProjectSchema;

    const gitlabProvider = new GitLabProvider(repository.baseUrl, repository.apiToken, project.id);
    const mergeRequestService = new MergeRequestService(
        gitlabProvider,
        llm.baseUrl,
        llm.apiKey,
        llm.model,
        repository.language,
    );

    try {
        switch (event) {
            case "Merge Request Hook": {
                if (repository.reviewMode === "off") {
                    return c.json({ message: "Review mode is off, skipping" }, 200);
                }

                const mergeRequest = payload.object_attributes as MergeRequestSchema;
                const action: string = (payload.object_attributes as { action?: string }).action ?? "";

                if (!REVIEWABLE_MR_ACTIONS.includes(action)) {
                    return c.json({ message: `Skipped: action '${action}'` }, 200);
                }

                if (action === "update" && !payload.object_attributes.oldrev) {
                    return c.json({ message: "Skipped: update without new commits" }, 200);
                }

                if (["draft", "closed", "merged"].includes(mergeRequest.state)) {
                    return c.json({ message: `Skipped: state '${mergeRequest.state}'` }, 200);
                }

                // If auto assign is enabled, assign reviewers to the merge request
                if (action === "open" && repository.autoAssign) {
                    await gitlabProvider.assignMergeRequestReviewer(mergeRequest.iid);
                }

                if (repository.reviewMode === "assigned_only") {
                    const reviewers = await gitlabProvider.fetchMergeRequestReviewerList(mergeRequest.iid);
                    const botUser = await gitlabProvider.fetchCurrentUser();
                    if (!reviewers.includes(botUser.username)) {
                        return c.json({ message: "Skipped: bot is not assigned as reviewer" }, 200);
                    }
                }

                mergeRequestService.review(mergeRequest.iid).catch((err) => {
                    console.error("Review failed:", err);
                });

                return c.json({ message: "Review started" }, 202);
            }

            case "Note Hook": {
                if (repository.replyMode === "off") {
                    return c.json({ message: "Reply mode is off, skipping" }, 200);
                }

                const note = payload.object_attributes;
                const noteableType: string = note.noteable_type ?? "";

                if (noteableType !== "MergeRequest") {
                    return c.json({ message: "Skipped: note is not on a merge request" }, 200);
                }

                const commenterUsername: string = payload.user?.username ?? "";
                const botUser = await gitlabProvider.fetchCurrentUser();

                if (commenterUsername === botUser.username) {
                    return c.json({ message: "Skipped: bot's own comment" }, 200);
                }

                const noteBody: string = note.note ?? note.body ?? "";
                const mrIid: number = payload.merge_request?.iid;

                if (repository.replyMode === "mention_only") {
                    const botMention = `@${repository.botUsername ?? botUser.username}`;
                    if (!noteBody.includes(botMention)) {
                        return c.json({ message: "Skipped: bot not mentioned" }, 200);
                    }
                }

                if (repository.replyMode === "assigned_only") {
                    const reviewers = await gitlabProvider.fetchMergeRequestReviewerList(mrIid);
                    if (!reviewers.includes(botUser.username)) {
                        return c.json({ message: "Skipped: bot is not assigned as reviewer" }, 200);
                    }
                }

                mergeRequestService.reply(mrIid, commenterUsername, noteBody).catch((err) => {
                    console.error("Reply failed:", err);
                });

                return c.json({ message: "Reply started" }, 202);
            }

            default:
                return c.json({ message: `Unhandled event: ${event}` }, 200);
        }
    } catch (error) {
        console.error(error);
        return c.json({ error: "Internal server error" }, 500);
    }
};
