import { Hono } from "hono";
import { loadGitLabContext } from "./gitlab/gitlab.middleware.js";
import { handleGitLabWebhook } from "./gitlab/gitlab.controller.js";
import { loadGitHubContext } from "./github/github.middleware.js";
import { handleGitHubWebhook } from "./github/github.controller.js";
import { loadForgejoContext } from "./forgejo/forgejo.middleware.js";
import { handleForgejoWebhook } from "./forgejo/forgejo.controller.js";
import { logWebhookIngress } from "./webhook.middleware.js";
import { updateRepositoryPath } from "./repository.middleware.js";

export const webhookRouter = new Hono();

webhookRouter.post("/gitlab", loadGitLabContext, updateRepositoryPath, logWebhookIngress, handleGitLabWebhook);
webhookRouter.post("/github", loadGitHubContext, updateRepositoryPath, logWebhookIngress, handleGitHubWebhook);
webhookRouter.post("/forgejo", loadForgejoContext, updateRepositoryPath, logWebhookIngress, handleForgejoWebhook);
