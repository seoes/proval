import { Hono } from "hono";
import { loadGitLabContext } from "./gitlab/gitlab.middleware.js";
import { handleGitLabWebhook } from "./gitlab/gitlab.controller.js";

export const webhookRouter = new Hono();

webhookRouter.post("/gitlab", loadGitLabContext, handleGitLabWebhook);
