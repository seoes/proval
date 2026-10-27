import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { resolve } from "node:path";

if (process.env.PROVAL_CLOSED_PR_REVIEW_TEST_CHILD !== "1") {
    it("passes closed pull request review middleware in an isolated process", () => {
        const result = Bun.spawnSync([process.execPath, "test", import.meta.path], {
            env: { ...process.env, PROVAL_CLOSED_PR_REVIEW_TEST_CHILD: "1", DB_FILE_NAME: ":memory:" },
            stdout: "pipe",
            stderr: "pipe",
        });
        if (result.exitCode !== 0) {
            throw new Error(result.stdout.toString() + result.stderr.toString());
        }
        expect(result.exitCode).toBe(0);
    }, 120000);
} else {
    process.env.DB_FILE_NAME = ":memory:";
    process.env.ENCRYPTION_KEY = Buffer.alloc(32, 23).toString("base64");

    const { Hono } = await import("hono");
    const { migrate } = await import("drizzle-orm/bun-sqlite/migrator");
    const { eq } = await import("drizzle-orm");
    const { default: db } = await import("../db/index.js");
    const { activityTable, gitProviderAccessTable, modelProviderTable, repositoryTable } = await import("@proval/db");
    const { encrypt } = await import("../util/encrypt.js");
    const { handleClosedPullRequestReview } = await import("./webhook.middleware.js");
    const { ActivityService } = await import("../api/activity/activity.service.js");

    migrate(db, { migrationsFolder: resolve(import.meta.dir, "../../../../packages/db/src/migration") });

    type RepositoryRow = typeof repositoryTable.$inferSelect;

    let controllerReached = false;
    let repository: RepositoryRow;
    let modelProviderId: number;
    let cancelSpy: ReturnType<typeof spyOn>;
    let fixtureCounter = 0;

    const app = new Hono();
    app.post("/hook", async (c, next) => {
        const payload = await c.req.json();
        c.set("gitlabPayload", payload);
        c.set("repository", repository);
        c.set("modelProvider", { id: modelProviderId });
        await next();
    }, handleClosedPullRequestReview, async (c) => {
        controllerReached = true;
        return c.json({ controller: true });
    });

    async function insertRepository(prReviewOnClose: RepositoryRow["prReviewOnClose"]) {
        fixtureCounter++;
        const suffix = String(fixtureCounter);
        const [modelProvider] = await db
            .insert(modelProviderTable)
            .values({
                provider: "openai",
                label: "Test",
                baseUrl: "http://localhost:1234/v1",
                apiKey: encrypt("key"),
            })
            .returning({ id: modelProviderTable.id });
        const [access] = await db
            .insert(gitProviderAccessTable)
            .values({
                provider: "gitlab",
                name: "Test",
                baseUrl: `https://gitlab.example.com/${suffix}`,
                accessToken: encrypt("token"),
            })
            .returning({ id: gitProviderAccessTable.id });
        const [row] = await db
            .insert(repositoryTable)
            .values({
                path: `group/repo-${suffix}`,
                provider: "gitlab",
                gitProviderAccessId: access.id,
                gitProviderRepositoryId: fixtureCounter,
                modelProviderId: modelProvider.id,
                modelName: "test",
                prReviewOnClose,
            })
            .returning();
        repository = row;
        modelProviderId = modelProvider.id;
    }

    async function postGitLabMergeRequest(body: Record<string, unknown>) {
        controllerReached = false;
        return app.request("/hook", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Gitlab-Event": "Merge Request Hook",
            },
            body: JSON.stringify(body),
        });
    }

    async function insertActivity(
        type: "pr_review" | "pr_reply",
        status: "queued" | "started" | "completed",
        targetIid: number,
    ) {
        const [row] = await db
            .insert(activityTable)
            .values({
                repositoryId: repository.id,
                repositoryPath: repository.path,
                provider: repository.provider,
                modelProviderId: modelProviderId,
                modelName: "test",
                type,
                targetIid,
                status,
                startedAt: status === "started" ? new Date() : null,
                completedAt: status === "completed" ? new Date() : null,
            })
            .returning();
        return row;
    }

    beforeEach(async () => {
        cancelSpy = spyOn(ActivityService.prototype, "cancel").mockResolvedValue(undefined);
        await insertRepository("cancel");
    });

    afterEach(() => {
        cancelSpy.mockRestore();
    });

    it("calls next for non close merge request actions", async () => {
        const response = await postGitLabMergeRequest({
            object_attributes: { action: "open", iid: 1 },
        });
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ controller: true });
        expect(controllerReached).toBe(true);
        expect(cancelSpy.mock.calls.length).toBe(0);
    });

    it("calls next for issue close events", async () => {
        const response = await app.request("/hook", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Gitlab-Event": "Issue Hook",
            },
            body: JSON.stringify({ object_attributes: { action: "close", iid: 1 } }),
        });
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ controller: true });
        expect(cancelSpy.mock.calls.length).toBe(0);
    });

    it("skips cancel when policy is continue", async () => {
        await db.update(repositoryTable).set({ prReviewOnClose: "continue" }).where(eq(repositoryTable.id, repository.id));
        repository = { ...repository, prReviewOnClose: "continue" };
        const response = await postGitLabMergeRequest({
            object_attributes: { action: "close", iid: 2 },
        });
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ message: "Skipped: continue after close" });
        expect(controllerReached).toBe(false);
        expect(cancelSpy.mock.calls.length).toBe(0);
    });

    it("does not reach the controller on close", async () => {
        const response = await postGitLabMergeRequest({
            object_attributes: { action: "merge", iid: 3 },
        });
        expect(response.status).toBe(200);
        expect(controllerReached).toBe(false);
    });

    it("continue_if_started keeps queued reviews when one has started", async () => {
        await db
            .update(repositoryTable)
            .set({ prReviewOnClose: "continue_if_started" })
            .where(eq(repositoryTable.id, repository.id));
        repository = { ...repository, prReviewOnClose: "continue_if_started" };
        await insertActivity("pr_review", "queued", 10);
        await insertActivity("pr_review", "started", 10);
        const response = await postGitLabMergeRequest({
            object_attributes: { action: "close", iid: 10 },
        });
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ message: "Skipped: review already started" });
        expect(cancelSpy.mock.calls.length).toBe(0);
    });

    it("continue_if_started cancels queued reviews when none has started", async () => {
        cancelSpy.mockRestore();
        await db
            .update(repositoryTable)
            .set({ prReviewOnClose: "continue_if_started" })
            .where(eq(repositoryTable.id, repository.id));
        repository = { ...repository, prReviewOnClose: "continue_if_started" };
        const queued = await insertActivity("pr_review", "queued", 14);
        const response = await postGitLabMergeRequest({
            object_attributes: { action: "close", iid: 14 },
        });
        expect(response.status).toBe(200);
        const [queuedRow] = await db.select().from(activityTable).where(eq(activityTable.id, queued.id));
        expect(queuedRow.status).toBe("canceled");
    });

    it("cancel policy cancels queued before started with merge reason", async () => {
        const cancelOrderSpy = spyOn(ActivityService.prototype, "cancel").mockResolvedValue(undefined);
        const started = await insertActivity("pr_review", "started", 11);
        const queued = await insertActivity("pr_review", "queued", 11);
        const response = await postGitLabMergeRequest({
            object_attributes: { action: "merge", iid: 11 },
        });
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ message: "Canceled in-flight review" });
        expect(cancelOrderSpy.mock.calls.map((call) => call[0])).toEqual([queued.id, started.id]);
        expect(cancelOrderSpy.mock.calls[0]?.[1]).toBe("Canceled because the pull request was merged");
        cancelOrderSpy.mockRestore();
    });

    it("does not cancel pr_reply", async () => {
        cancelSpy.mockRestore();
        const reply = await insertActivity("pr_reply", "started", 12);
        const response = await postGitLabMergeRequest({
            object_attributes: { action: "close", iid: 12 },
        });
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ message: "Skipped: no review to cancel" });
        const [replyRow] = await db.select().from(activityTable).where(eq(activityTable.id, reply.id));
        expect(replyRow.status).toBe("started");
    });

    it("ignores cancel errors for finished activities", async () => {
        cancelSpy.mockRestore();
        await insertActivity("pr_review", "completed", 13);
        const response = await postGitLabMergeRequest({
            object_attributes: { action: "close", iid: 13 },
        });
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ message: "Skipped: no review to cancel" });
    });

    it("cancel without reason leaves errorMessage empty", async () => {
        cancelSpy.mockRestore();
        const service = new ActivityService();
        const id = await service.start(
            {
                repositoryId: repository.id,
                modelProviderId,
                modelName: "test",
                type: "pr_review",
                targetIid: 99,
            },
            "queued",
        );
        await service.cancel(id);
        const [row] = await db.select().from(activityTable).where(eq(activityTable.id, id));
        expect(row.status).toBe("canceled");
        expect(row.errorMessage).toBeNull();
    });
}
