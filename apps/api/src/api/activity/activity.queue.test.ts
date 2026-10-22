import { afterAll, afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import { resolve } from "node:path";

if (process.env.PROVAL_ACTIVITY_QUEUE_TEST_CHILD !== "1") {
    it("passes activity queue integration in an isolated process", () => {
        const result = Bun.spawnSync([process.execPath, "test", import.meta.path], {
            env: { ...process.env, PROVAL_ACTIVITY_QUEUE_TEST_CHILD: "1", DB_FILE_NAME: ":memory:" },
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
    process.env.ENCRYPTION_KEY = Buffer.alloc(32, 17).toString("base64");

    const usage = { inputToken: 1, cachedInputToken: 0, outputToken: 1 };
    let reviewHold: Promise<void> | null = null;
    let releaseReview: (() => void) | null = null;

    const runPullRequestReviewMock = mock(async () => {
        if (reviewHold) await reviewHold;
        return usage;
    });
    const runPullRequestReplyMock = mock(async () => usage);
    const runIssueReplyOnOpenMock = mock(async () => usage);
    const runIssueReplyMock = mock(async () => usage);

    mock.module("../../agent/pull-request/index.js", () => ({
        runPullRequestReview: runPullRequestReviewMock,
        runPullRequestReply: runPullRequestReplyMock,
    }));
    mock.module("../../agent/issue/index.js", () => ({
        runIssueReplyOnOpen: runIssueReplyOnOpenMock,
        runIssueReply: runIssueReplyMock,
    }));

    const { and, asc, eq } = await import("drizzle-orm");
    const { migrate } = await import("drizzle-orm/bun-sqlite/migrator");
    const { default: db } = await import("../../db/index.js");
    const { activityTable, gitProviderAccessTable, modelProviderTable, repositoryTable } = await import("@proval/db");
    const { encrypt } = await import("../../util/encrypt.js");
    const { ActivityService } = await import("./activity.service.js");
    const { activityQueue } = await import("./activity.queue.js");

    migrate(db, { migrationsFolder: resolve(import.meta.dir, "../../../../../packages/db/src/migration") });

    const consoleError = spyOn(console, "error").mockImplementation(() => {});
    afterAll(() => {
        consoleError.mockRestore();
    });

    let fixtureCounter = 0;

    async function insertProvider(activityConcurrency: number | null = null) {
        fixtureCounter++;
        const suffix = String(fixtureCounter);
        const [modelProvider] = await db
            .insert(modelProviderTable)
            .values({
                provider: "openai",
                label: "Test",
                baseUrl: "http://localhost:1234/v1",
                apiKey: encrypt("test key"),
                activityConcurrency,
            })
            .returning({ id: modelProviderTable.id });
        const [access] = await db
            .insert(gitProviderAccessTable)
            .values({
                provider: "gitlab",
                name: "Test",
                baseUrl: `https://gitlab.example.com/${suffix}`,
                accessToken: encrypt("glpat-test"),
            })
            .returning({ id: gitProviderAccessTable.id });
        const [repository] = await db
            .insert(repositoryTable)
            .values({
                path: `group/repo-${suffix}`,
                provider: "gitlab",
                gitProviderAccessId: access.id,
                gitProviderRepositoryId: 5,
                accessToken: encrypt("glpat-repository"),
                modelProviderId: modelProvider.id,
                modelName: "test-model",
            })
            .returning({ id: repositoryTable.id });
        return { modelProvider, repository };
    }

    function reviewInput(repositoryId: number, modelProviderId: number, prIid: number, headSha: string) {
        return {
            repositoryId,
            modelProviderId,
            modelName: "test-model",
            type: "pr_review" as const,
            targetIid: prIid,
            headSha,
        };
    }

    async function waitForStatus(id: number, status: string, timeoutMs = 15000) {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            const [row] = await db.select().from(activityTable).where(eq(activityTable.id, id));
            if (row?.status === status) return row;
            await Bun.sleep(10);
        }
        throw new Error(`Timed out waiting for activity ${id} to become ${status}`);
    }

    async function drainSettled() {
        activityQueue.drain();
        await Bun.sleep(50);
    }

    describe("activity queue", () => {
        beforeEach(async () => {
            await db.delete(activityTable);
            runPullRequestReviewMock.mockClear();
            reviewHold = new Promise<void>((resolve) => {
                releaseReview = resolve;
            });
        });

        afterEach(() => {
            releaseReview?.();
            reviewHold = null;
            releaseReview = null;
        });

        it("coalesces duplicate pr_review push into one queued row", async () => {
            const { modelProvider, repository } = await insertProvider();
            const firstId = await activityQueue.push(
                reviewInput(repository.id, modelProvider.id, 1, "sha-a"),
            );
            const secondId = await activityQueue.push(
                reviewInput(repository.id, modelProvider.id, 1, "sha-b"),
            );
            expect(secondId).toBe(firstId);
            const rows = await db
                .select()
                .from(activityTable)
                .where(and(eq(activityTable.repositoryId, repository.id), eq(activityTable.type, "pr_review")));
            expect(rows).toHaveLength(1);
            expect(rows[0].status).toBe("queued");
            expect(rows[0].headSha).toBe("sha-b");
        });

        it("limits concurrent activities per provider", async () => {
            const { modelProvider, repository } = await insertProvider(1);
            const idA = await activityQueue.push(reviewInput(repository.id, modelProvider.id, 1, "sha-1"));
            const idB = await activityQueue.push(reviewInput(repository.id, modelProvider.id, 2, "sha-2"));
            activityQueue.drain();
            await Bun.sleep(80);
            const rowA = await waitForStatus(idA, "started", 3000);
            const rowB = await db.select().from(activityTable).where(eq(activityTable.id, idB)).then((r) => r[0]);
            expect(rowA.status).toBe("started");
            expect(rowB.status).toBe("queued");
            releaseReview?.();
            reviewHold = new Promise<void>((resolve) => {
                releaseReview = resolve;
            });
            await waitForStatus(idA, "completed", 10000);
            activityQueue.drain();
            await waitForStatus(idB, "started", 10000);
        });

        it("does not start queued pr_review while same pr is started", async () => {
            const { modelProvider, repository } = await insertProvider(2);
            const startedId = await activityQueue.push(reviewInput(repository.id, modelProvider.id, 1, "sha-1"));
            activityQueue.drain();
            await waitForStatus(startedId, "started", 3000);
            const queuedId = await activityQueue.push(reviewInput(repository.id, modelProvider.id, 1, "sha-2"));
            expect(queuedId).not.toBe(startedId);
            const otherId = await activityQueue.push(reviewInput(repository.id, modelProvider.id, 2, "sha-3"));
            activityQueue.drain();
            await Bun.sleep(80);
            const other = await waitForStatus(otherId, "started", 3000);
            expect(other.status).toBe("started");
            const [samePr] = await db.select().from(activityTable).where(eq(activityTable.id, startedId));
            expect(samePr.status).toBe("started");
        });

        it("serializes same pr_review without activity concurrency limit", async () => {
            const { modelProvider, repository } = await insertProvider(null);
            const startedId = await activityQueue.push(reviewInput(repository.id, modelProvider.id, 1, "sha-1"));
            activityQueue.drain();
            await waitForStatus(startedId, "started", 3000);
            const queuedId = await activityQueue.push(reviewInput(repository.id, modelProvider.id, 1, "sha-2"));
            expect(queuedId).not.toBe(startedId);
            activityQueue.drain();
            await Bun.sleep(80);
            const [startedRow] = await db.select().from(activityTable).where(eq(activityTable.id, startedId));
            const [queuedRow] = await db.select().from(activityTable).where(eq(activityTable.id, queuedId));
            expect(startedRow.status).toBe("started");
            expect(queuedRow.status).toBe("queued");
        });

        it("does not run runner when queued row was canceled before claim", async () => {
            const callsBefore = runPullRequestReviewMock.mock.calls.length;
            const { modelProvider, repository } = await insertProvider();
            const id = await activityQueue.push(reviewInput(repository.id, modelProvider.id, 9, "sha-x"));
            await new ActivityService().cancel(id);
            await drainSettled();
            expect(runPullRequestReviewMock.mock.calls.length).toBe(callsBefore);
        });

        it("starts next queued activity after cancel", async () => {
            const callsBefore = runPullRequestReviewMock.mock.calls.length;
            const { modelProvider, repository } = await insertProvider(1);
            const firstId = await activityQueue.push(reviewInput(repository.id, modelProvider.id, 1, "sha-1"));
            const secondId = await activityQueue.push(reviewInput(repository.id, modelProvider.id, 2, "sha-2"));
            await new ActivityService().cancel(secondId);
            activityQueue.drain();
            await waitForStatus(firstId, "started", 10000);
            const newCalls = runPullRequestReviewMock.mock.calls.slice(callsBefore);
            const callsForSecond = newCalls.filter((call) => (call[0] as { prIid?: number }).prIid === 2);
            expect(callsForSecond.length).toBe(0);
        });

        it("refuses retry when pr_review is already queued", async () => {
            const { modelProvider, repository } = await insertProvider();
            const service = new ActivityService();
            const [failed] = await db
                .insert(activityTable)
                .values({
                    repositoryId: repository.id,
                    repositoryPath: "group/repo",
                    provider: "gitlab",
                    modelProviderId: modelProvider.id,
                    modelName: "test-model",
                    type: "pr_review",
                    status: "failed",
                    targetIid: 3,
                    headSha: "old-head",
                    logVersion: "1",
                    errorMessage: "boom",
                })
                .returning();
            await activityQueue.push(reviewInput(repository.id, modelProvider.id, 3, "queued-head"));
            await expect(service.retry(failed.id)).rejects.toThrow(
                "A review for this pull request is already queued or running",
            );
            const [queued] = await db
                .select()
                .from(activityTable)
                .where(and(eq(activityTable.status, "queued"), eq(activityTable.targetIid, 3)));
            expect(queued.headSha).toBe("queued-head");
        });

        it("drains queued rows after boot marks started as failed", async () => {
            const { modelProvider, repository } = await insertProvider();
            const queuedId = await activityQueue.push(reviewInput(repository.id, modelProvider.id, 4, "sha-q"));
            await db
                .insert(activityTable)
                .values({
                    repositoryId: repository.id,
                    repositoryPath: "group/repo",
                    provider: "gitlab",
                    modelProviderId: modelProvider.id,
                    modelName: "test-model",
                    type: "pr_review",
                    status: "started",
                    targetIid: 99,
                    headSha: "dead",
                    logVersion: "1",
                });
            await db.update(activityTable).set({ status: "failed" }).where(eq(activityTable.status, "started"));
            activityQueue.drain();
            await waitForStatus(queuedId, "started", 5000);
            const [stillQueued] = await db.select().from(activityTable).where(eq(activityTable.id, queuedId));
            expect(stillQueued.status).toBe("started");
        });
    });
}
