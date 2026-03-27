import { Hono } from "hono";
import { apiRouter } from "./api/index.js";
import { cors } from "hono/cors";
import { webhookRouter } from "./webhook/webhook.route.js";

const app = new Hono();

app.use("/api/*", cors());

app.route("/webhook", webhookRouter);
app.route("/api", apiRouter);

export default app;
