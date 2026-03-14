import { Hono } from "hono";
import { loadGitLabContext } from "./webhook.middleware.js";
import { handleGitLabWebhook } from "./webhook.controller.js";

export const webhookRouter = new Hono();

webhookRouter.post("/gitlab", loadGitLabContext, handleGitLabWebhook);
