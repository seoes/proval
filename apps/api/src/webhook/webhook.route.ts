import { Hono } from "hono";
import { parseGitLabWebhook, verifyGitLabWebhook } from "./gitlab/gitlab.middleware.js";
import { handleGitLabWebhook } from "./gitlab/gitlab.controller.js";
import { loadGitHubContext } from "./github/github.middleware.js";
import { handleGitHubWebhook } from "./github/github.controller.js";
import { parseForgejoWebhook, verifyForgejoWebhook } from "./forgejo/forgejo.middleware.js";
import { handleForgejoWebhook } from "./forgejo/forgejo.controller.js";
import { loadRepository } from "./load-repository.middleware.js";
import { handleClosedPullRequestReview, logWebhookIngress, logWebhookRequest } from "./webhook.middleware.js";

export const webhookRouter = new Hono();

webhookRouter.post(
    "/gitlab",
    logWebhookRequest,
    parseGitLabWebhook,
    verifyGitLabWebhook,
    loadRepository,
    logWebhookIngress,
    handleClosedPullRequestReview,
    handleGitLabWebhook,
);
webhookRouter.post(
    "/forgejo",
    logWebhookRequest,
    parseForgejoWebhook,
    verifyForgejoWebhook,
    loadRepository,
    logWebhookIngress,
    handleClosedPullRequestReview,
    handleForgejoWebhook,
);
webhookRouter.post(
    "/github",
    logWebhookRequest,
    loadGitHubContext,
    logWebhookIngress,
    handleClosedPullRequestReview,
    handleGitHubWebhook,
);
