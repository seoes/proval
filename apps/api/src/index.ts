import app from "./app.js";
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

    app.use("/*", serveStatic({ root: "./public" }));
    app.get("*", serveStatic({ path: "./public/index.html" }));
} else {
    console.log("Development environment");
    app.get("/", (c) => {
        return c.text("Hello Hono!");
    });
}

export default {
    fetch: app.fetch,
    port: 7900,
};
