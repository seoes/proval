import { Hono } from "hono";
import { loadGitLabContext } from "./gitlab/gitlab.middleware.js";
import { handleGitLabWebhook } from "./gitlab/gitlab.controller.js";
import { loadGitHubContext } from "./github/github.middleware.js";
import { handleGitHubWebhook } from "./github/github.controller.js";

export const webhookRouter = new Hono();

webhookRouter.post("/gitlab", loadGitLabContext, handleGitLabWebhook);
webhookRouter.post("/github", loadGitHubContext, handleGitHubWebhook);