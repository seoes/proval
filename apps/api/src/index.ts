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
import { ActivityService, recoverLegacyReplyTargetComment } from "./api/activity/activity.service.js";
import { activityQueue } from "./api/activity/activity.queue.js";
import { authService } from "./api/auth/auth.service.js";

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

const { rerunInterruptedActivity: isRerunInterruptedActivity } = await authService.getOrCreateInstanceSetting();

if (isRerunInterruptedActivity) {
    await activityQueue.mergeDuplicated();
} else {
    const runningActivityList = await db
        .select({ id: activityTable.id })
        .from(activityTable)
        .where(eq(activityTable.status, "started"));
    const activityService = new ActivityService();
    await Promise.all(
        runningActivityList.map(({ id }) =>
            activityService.fail(id, "Server restarted while this activity was running"),
        ),
    );
}

activityQueue.drain();

let isExiting = false;
const shutdownWaitMs = 7_200_000;

async function shutdownAndExit(signal: string) {
    if (isExiting) process.exit(0);
    isExiting = true;
    log(`Received ${signal}`);
    try {
        let shouldWait = false;
        try {
            const setting = await authService.getOrCreateInstanceSetting();
            shouldWait = setting.waitForRunningActivityOnShutdown;
        } catch (error) {
            logError("Failed to read instance setting on shutdown", error);
        }
        if (!shouldWait) return;
        activityQueue.stopQueueForShutdown();
        const deadline = Date.now() + shutdownWaitMs;
        log("Waiting for running activities to finish");
        while (Date.now() < deadline) {
            const [started] = await db
                .select({ id: activityTable.id })
                .from(activityTable)
                .where(eq(activityTable.status, "started"))
                .limit(1);
            if (!started) {
                console.log("No running activities...");
                return;
            }
            await Bun.sleep(1000);
        }
        log("Shutdown wait timed out after 7200 seconds");
    } catch (error) {
        logError("Failed while waiting for running activities", error);
    } finally {
        process.exit(0);
    }
}

process.on("SIGTERM", () => {
    void shutdownAndExit("SIGTERM");
});

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
