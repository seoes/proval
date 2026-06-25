import { apiApp, webhookApp } from "./app.js";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import db from "./db/index.js";
import { serveStatic } from "hono/bun";
import { log, logError } from "./util/log.js";
import pc from "picocolors";
import { activityTable } from "@proval/db";
import { eq } from "drizzle-orm";
import { loadEncryptionKey } from "./util/encrypt.js";

loadEncryptionKey();

log(pc.bgGreen(pc.bold(" PROVAL IS RUNNING ")));
log(pc.bgGreen(pc.bold(" ENCRYPTION KEY SET ")));

if (process.env.NODE_ENV === "production") {
    try {
        migrate(db, { migrationsFolder: "./migration" });
        log(pc.bgGreen(pc.bold(" Database migrated successfully ")));
    } catch (error) {
        logError("Error migrating database", error);
        process.exit(1);
    }

    apiApp.use("/*", serveStatic({ root: "./public" }));
    apiApp.get("*", serveStatic({ path: "./public/index.html" }));
} else {
    log(pc.bgBlueBright(pc.white(pc.bold(" Development environment "))));
    apiApp.get("/", (c) => {
        return c.text("Hello Hono!");
    });
}

await db.update(activityTable).set({ status: "failed" }).where(eq(activityTable.status, "started"));

Bun.serve({
    fetch: apiApp.fetch,
    port: 7900,
});

Bun.serve({
    fetch: webhookApp.fetch,
    port: 7901,
});
