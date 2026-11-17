import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { apiRouter } from "./api/routes.js";
import { cors } from "hono/cors";
import { logError } from "./util/log.js";
import { webhookRouter } from "./webhook/webhook.route.js";

export const webhookApp = new Hono();
webhookApp.onError((error, c) => {
    if (error instanceof HTTPException) {
        return error.getResponse();
    }
    logError("Webhook processing failed", error);
    return c.json({ error: "Webhook processing failed" }, 503);
});
webhookApp.get("/", (c) => {
    return c.text("Hello Proval!");
});
webhookApp.route("/webhook", webhookRouter);

export const apiApp = new Hono();
apiApp.use("/api/*", cors());
apiApp.route("/api", apiRouter);
