import { apiApp, webhookApp } from "./app.js";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import db from "./db/index.js";
import { serveStatic } from "hono/bun";
import { log, logError } from "./util/log.js";
import pc from "picocolors";
import { activityTable } from "@proval/db";
import { eq } from "drizzle-orm";
import { loadEncryptionKey } from "./util/encrypt.js";
import { clearWorkspaceRoot } from "./git-provider/workspace.js";
import { recoverLegacyReplyTargetComment } from "./api/activity/activity.service.js";

loadEncryptionKey();

log(pc.bgGreen(pc.bold(" PROVAL IS RUNNING ")));
log(pc.bgGreen(pc.bold(" ENCRYPTION KEY SET ")));

try {
    await clearWorkspaceRoot();
    log(pc.bgGreen(pc.bold(" Workspace cleared ")));
} catch (error) {
    logError("Failed to clear workspace root", error);
}

if (process.env.NODE_ENV === "production") {
    // SQLite treats PRAGMA foreign_keys as a no op inside a transaction and the
    // migrator wraps every migration in one. A table rebuild migration drop a
    // table that another table reference with ON DELETE restrict, so the drop
    // fail unless enforcement is turned off out here first.
    db.$client.run("PRAGMA foreign_keys = OFF");
    try {
        migrate(db, { migrationsFolder: "./migration" });
        log(pc.bgGreen(pc.bold(" Database migrated successfully ")));
    } catch (error) {
        logError("Error migrating database", error);
        process.exit(1);
    } finally {
        db.$client.run("PRAGMA foreign_keys = ON");
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

const recoveredReplyTargetCount = recoverLegacyReplyTargetComment();
if (recoveredReplyTargetCount > 0) {
    log(pc.bgGreen(pc.bold(` Recovered ${recoveredReplyTargetCount} legacy reply comment link(s) `)));
}

Bun.serve({
    fetch: apiApp.fetch,
    port: 7900,
});

Bun.serve({
    fetch: webhookApp.fetch,
    port: 7901,
});
