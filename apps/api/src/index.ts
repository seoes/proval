import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { webhookRouter } from "./webhook/webhook.route.js";
import { apiRouter } from "./api/index.js";
import { cors } from "hono/cors";

const app = new Hono();

app.get("/", (c) => {
    return c.text("Hello Hono!");
});

app.route("/webhook", webhookRouter);

app.use("/api/*", cors());
app.route("/api", apiRouter);

serve(
    {
        fetch: app.fetch,
        port: 7900,
    },
    (info) => {
        console.log(`Server is running on http://localhost:${info.port}`);
    },
);
