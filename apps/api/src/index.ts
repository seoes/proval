import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import app from "./app.js";

if (process.env.NODE_ENV === "production") {
    console.log("Production environment");
    app.use("/*", serveStatic({ root: "./public" }));
    app.get("*", serveStatic({ path: "./public/index.html" }));
} else {
    console.log("Development environment");
    app.get("/", (c) => {
        return c.text("Hello Hono!");
    });
}

serve(
    {
        fetch: app.fetch,
        port: 7900,
    },
    (info) => {
        console.log(`Server is running on port ${info.port}`);
    },
);
