import { apiApp, webhookApp } from "./app.js";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import db from "./db/index.js";
import { serveStatic } from "hono/bun";

if (process.env.NODE_ENV === "production") {
    console.log("Production environment");

    try {
        migrate(db, { migrationsFolder: "./migration" });
        console.log("Database migrated successfully");
    } catch (error) {
        console.error("Error migrating database", error);
        process.exit(1);
    }

    apiApp.use("/*", serveStatic({ root: "./public" }));
    apiApp.get("*", serveStatic({ path: "./public/index.html" }));
} else {
    console.log("Development environment");
    apiApp.get("/", (c) => {
        return c.text("Hello Hono!");
    });
}

Bun.serve({
    fetch: apiApp.fetch,
    port: 7900,
});

Bun.serve({
    fetch: webhookApp.fetch,
    port: 7901,
});
