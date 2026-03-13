import type { MergeRequestSchema, ProjectSchema } from "@gitbeaker/rest";
import { Hono } from "hono";
import type { Context } from "hono";
import { ReviewService } from "../review/review.service.js";
import { GitLabProvider } from "../../provider/gitlab.js";
import { llmConfigTable, repositoryTable } from "../../db/schema.js";
import { type InferSelectModel } from "drizzle-orm";
import { loadGitLabContext } from "./webhook.middleware.js";

export const webhookController = new Hono();

// gitlab
webhookController.post("/gitlab", loadGitLabContext, async (c: Context) => {
    console.log("GitLab Webhook Received");
    const event = c.req.header("X-Gitlab-Event");
    const payload = await c.req.json();

    const repository = c.get("repository") as InferSelectModel<typeof repositoryTable>;
    const llm = c.get("llm") as InferSelectModel<typeof llmConfigTable>;

    const project = payload.project as ProjectSchema;

    const gitlabProvider = new GitLabProvider(repository.baseUrl, repository.apiToken, project.id);
    const reviewService = new ReviewService(gitlabProvider, llm.baseUrl, llm.apiKey, llm.model, repository.language);

    console.log(event);

    try {
        switch (event) {
            case "Merge Request Hook":
                const mergeRequest = payload.object_attributes as MergeRequestSchema;
                if (
                    mergeRequest.state === "draft" ||
                    mergeRequest.state === "closed" ||
                    mergeRequest.state === "merged"
                ) {
                    return c.json(
                        { error: `Merge request is not in a valid state to be reviewed (${mergeRequest.state})` },
                        400,
                    );
                }
                await reviewService.reviewMergeRequest(mergeRequest.iid);
                break;
            case "Push Hook":
                break;
            default:
                console.log("Unhandled Event");
                return c.json({ error: "Unhandled event" }, 400);
        }
    } catch (error) {
        console.error(error);
        return c.json({ error: "Internal server error" }, 500);
    }

    return c.json({ message: "Webhook received" }, 200);
});
