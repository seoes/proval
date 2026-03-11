import type { MergeRequestSchema, ProjectSchema } from "@gitbeaker/rest";
import { Hono } from "hono";
import type { Context, Next } from "hono";
import { ReviewService } from "../review/review.service.js";
import { GitLabProvider } from "../../provider/gitlab.js";

export const webhookController = new Hono();

const checkGitLabSecretMiddleware = async (c: Context, next: Next) => {
    console.log("Checking secret");
    const secret = c.req.header("X-Gitlab-Token");
    console.log("Secret: ", secret);
    const expectedSecret = process.env.GITLAB_WEBHOOK_SECRET || "";
    console.log("Expected Secret: ", expectedSecret);
    if (secret !== expectedSecret) {
        return c.text("Invalid token", 401);
    }
    await next();
};

// gitlab
webhookController.post("/gitlab", checkGitLabSecretMiddleware, async (c: Context) => {
    console.log("GitLab Webhook Received");
    const event = c.req.header("X-Gitlab-Event");
    const payload = await c.req.json();

    switch (event) {
        case "Merge Request Hook":
            console.log("Merge Request Hook");
            const mergeRequest = payload.object_attributes as MergeRequestSchema;
            const project = payload.project as ProjectSchema;

            const token = process.env.GITLAB_API_TOKEN;
            const baseUrl = process.env.GITLAB_URL;

            if (!token || !baseUrl) {
                return c.json({ error: "GitLab token or base URL is not set" }, 500);
            }

            const gitlabProvider = new GitLabProvider(baseUrl, token, project.id);
            const reviewService = new ReviewService(gitlabProvider);
            console.log("@@@ REVIEW SERVICE: Reviewing merge request");
            console.log(mergeRequest);

            reviewService.reviewMergeRequest(mergeRequest.iid).catch((err) => {
                console.error(err);
                return c.json({ error: "Review failed" }, 500);
            });

            return c.json({ message: "Review completed" }, 200);
        case "Push Hook":
            console.log("Push Hook");
            break;
        case "Note Hook":
            console.log("Note Hook");
            break;
        default:
            console.log("Unhandled Event");
    }
});
