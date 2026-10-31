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

    const runPullRequestReviewMock = mock(async (_input: { prIid?: number }) => {
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

        it("replaces the triage record when a push folds into a queued review", async () => {
            const { modelProvider, repository } = await insertProvider();
            const first = { rule: "normal", depth: "normal", applied: true } as never;
            const second = { rule: "small_delta", depth: "light", applied: true } as never;
            const firstId = await activityQueue.push({
                ...reviewInput(repository.id, modelProvider.id, 1, "sha-a"),
                triage: first,
            });
            const secondId = await activityQueue.push({
                ...reviewInput(repository.id, modelProvider.id, 1, "sha-b"),
                triage: second,
            });
            expect(secondId).toBe(firstId);
            const [row] = await db.select().from(activityTable).where(eq(activityTable.id, firstId));
            expect(row.headSha).toBe("sha-b");
            expect(row.triage).toEqual(second);
        });

        it("keeps the triage record when a folded push carries none", async () => {
            const { modelProvider, repository } = await insertProvider();
            const first = { rule: "normal", depth: "normal", applied: true } as never;
            const id = await activityQueue.push({
                ...reviewInput(repository.id, modelProvider.id, 1, "sha-a"),
                triage: first,
            });
            await activityQueue.push(reviewInput(repository.id, modelProvider.id, 1, "sha-b"));
            const [row] = await db.select().from(activityTable).where(eq(activityTable.id, id));
            expect(row.headSha).toBe("sha-b");
            expect(row.triage).toEqual(first);
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
            expect(startedRow.startedAt).not.toBeNull();
            expect(queuedRow.status).toBe("queued");
            expect(queuedRow.startedAt).toBeNull();
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
            const callsForSecond = newCalls.filter((call) => call[0].prIid === 2);
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

        it("mergeDuplicated cancels started pr_review when a queued review exists and drain runs that review", async () => {
            const { modelProvider, repository } = await insertProvider();
            const queuedId = await activityQueue.push(reviewInput(repository.id, modelProvider.id, 7, "sha-queued"));
            const partialLog = {
                type: "common" as const,
                timestamp: "2020-01-01T00:00:00.000Z",
                level: "info" as const,
                message: "partial",
            };
            const [startedRow] = await db
                .insert(activityTable)
                .values({
                    repositoryId: repository.id,
                    repositoryPath: "group/repo",
                    provider: "gitlab",
                    modelProviderId: modelProvider.id,
                    modelName: "test-model",
                    type: "pr_review",
                    status: "started",
                    targetIid: 7,
                    headSha: "sha-old",
                    logVersion: "1",
                    logs: [partialLog],
                    startedAt: new Date(),
                    createdAt: new Date("2020-01-01"),
                })
                .returning();
            await activityQueue.mergeDuplicated();
            const [canceled] = await db.select().from(activityTable).where(eq(activityTable.id, startedRow.id));
            expect(canceled.status).toBe("canceled");
            expect(canceled.headSha).toBe("sha-old");
            expect(canceled.logs).toEqual([partialLog]);
            expect(canceled.errorMessage).toBe("Canceled on restart because a queued review will run instead");
            const [queued] = await db.select().from(activityTable).where(eq(activityTable.id, queuedId));
            expect(queued.status).toBe("queued");
            expect(queued.headSha).toBe("sha-queued");
            expect(queued.logs).toEqual([]);
            activityQueue.drain();
            await waitForStatus(queuedId, "started", 5000);
        });

        it("mergeDuplicated clones a lone started pr_review without running", async () => {
            const callsBefore = runPullRequestReviewMock.mock.calls.length;
            const { modelProvider, repository } = await insertProvider();
            const partialLog = {
                type: "common" as const,
                timestamp: "2020-01-01T00:00:00.000Z",
                level: "info" as const,
                message: "partial",
            };
            const createdAt = new Date("2020-01-01");
            const [startedRow] = await db
                .insert(activityTable)
                .values({
                    repositoryId: repository.id,
                    repositoryPath: "group/repo",
                    provider: "gitlab",
                    modelProviderId: modelProvider.id,
                    modelName: "test-model",
                    type: "pr_review",
                    status: "started",
                    targetIid: 8,
                    headSha: "sha-lone",
                    logVersion: "1",
                    logs: [partialLog],
                    startedAt: new Date(),
                    createdAt,
                })
                .returning();
            await activityQueue.mergeDuplicated();
            const rows = await db.select().from(activityTable).where(eq(activityTable.repositoryId, repository.id));
            const canceled = rows.find((row) => row.id === startedRow.id);
            const queued = rows.find((row) => row.id !== startedRow.id);
            expect(canceled?.status).toBe("canceled");
            expect(canceled?.logs).toEqual([partialLog]);
            expect(canceled?.errorMessage).toBe("Canceled on restart because this activity was queued again");
            expect(queued?.status).toBe("queued");
            expect(queued?.headSha).toBe("sha-lone");
            expect(queued?.logs).toEqual([]);
            expect(queued?.startedAt).toBeNull();
            expect(queued?.createdAt?.getTime()).toBe(createdAt.getTime());
            expect(runPullRequestReviewMock.mock.calls.length).toBe(callsBefore);
        });

        it("mergeDuplicated keeps the triage record on the cloned row", async () => {
            const { modelProvider, repository } = await insertProvider();
            const triage = { rule: "small_delta", depth: "light", applied: true } as never;
            const [startedRow] = await db
                .insert(activityTable)
                .values({
                    repositoryId: repository.id,
                    repositoryPath: "group/repo",
                    provider: "gitlab",
                    modelProviderId: modelProvider.id,
                    modelName: "test-model",
                    type: "pr_review",
                    status: "started",
                    targetIid: 9,
                    headSha: "sha-light",
                    triage,
                    logVersion: "1",
                    startedAt: new Date(),
                })
                .returning();
            await activityQueue.mergeDuplicated();
            const rows = await db.select().from(activityTable).where(eq(activityTable.repositoryId, repository.id));
            const queued = rows.find((row) => row.id !== startedRow.id);
            expect(queued?.status).toBe("queued");
            expect(queued?.triage).toEqual(triage);
        });

        it("drain runs the cloned row after mergeDuplicated", async () => {
            const { modelProvider, repository } = await insertProvider();
            await db.insert(activityTable).values({
                repositoryId: repository.id,
                repositoryPath: "group/repo",
                provider: "gitlab",
                modelProviderId: modelProvider.id,
                modelName: "test-model",
                type: "pr_review",
                status: "started",
                targetIid: 10,
                headSha: "sha-requeue",
                logVersion: "1",
                startedAt: new Date(),
            });
            await activityQueue.mergeDuplicated();
            const [queued] = await db
                .select()
                .from(activityTable)
                .where(
                    and(
                        eq(activityTable.repositoryId, repository.id),
                        eq(activityTable.targetIid, 10),
                        eq(activityTable.status, "queued"),
                    ),
                );
            expect(queued.status).toBe("queued");
            activityQueue.drain();
            await waitForStatus(queued.id, "started", 5000);
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

        it("stopQueueForShutdown leaves later queued activity while running review finishes", async () => {
            const { modelProvider, repository } = await insertProvider(1);
            const runningId = await activityQueue.push(reviewInput(repository.id, modelProvider.id, 20, "sha-run"));
            activityQueue.drain();
            await waitForStatus(runningId, "started", 5000);
            const nextQueuedId = await activityQueue.push(
                reviewInput(repository.id, modelProvider.id, 21, "sha-next"),
            );
            activityQueue.stopQueueForShutdown();
            releaseReview?.();
            releaseReview = null;
            reviewHold = null;
            await waitForStatus(runningId, "completed", 5000);
            await Bun.sleep(100);
            const [next] = await db.select().from(activityTable).where(eq(activityTable.id, nextQueuedId));
            expect(next.status).toBe("queued");
        });
    });
}
