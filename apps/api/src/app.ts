import { Hono } from "hono";
import { apiRouter } from "./api/index.js";
import { cors } from "hono/cors";
import { webhookRouter } from "./webhook/webhook.route.js";

export const webhookApp = new Hono();
webhookApp.get("/", (c) => {
    return c.text("Hello Proval!");
});
webhookApp.route("/webhook", webhookRouter);

export const apiApp = new Hono();
apiApp.use("/api/*", cors());
apiApp.route("/api", apiRouter);
