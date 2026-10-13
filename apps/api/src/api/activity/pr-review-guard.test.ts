import { beforeEach, describe, expect, it } from "bun:test";
import { resolve } from "node:path";

// Isolate the real database from module mocks in other test files.
if (process.env.PROVAL_PR_REVIEW_GUARD_TEST_CHILD !== "1") {
    it("passes pull request review guard integration in an isolated process", () => {
        const result = Bun.spawnSync([process.execPath, "test", import.meta.path], {
            env: { ...process.env, PROVAL_PR_REVIEW_GUARD_TEST_CHILD: "1", DB_FILE_NAME: ":memory:" },
            stdout: "pipe",
            stderr: "pipe",
        });
        if (result.exitCode !== 0) {
            throw new Error(result.stdout.toString() + result.stderr.toString());
        }
        expect(result.exitCode).toBe(0);
    }, 30000);
} else {
    process.env.DB_FILE_NAME = ":memory:";
    const { migrate } = await import("drizzle-orm/bun-sqlite/migrator");
    const { activityTable, repositoryTable } = await import("@proval/db");
    const { default: db } = await import("../../db/index.js");
    // Loaded before the service: log.ts builds an ActivityService at module load.
    await import("../../util/log.js");
    const { ActivityService } = await import("./activity.service.js");

    migrate(db, { migrationsFolder: resolve(import.meta.dir, "../../../../../packages/db/src/migration") });
    const service = new ActivityService();

    type ActivityType = "pr_review" | "pr_reply" | "issue_open" | "issue_reply";
    type ActivityStatus = "started" | "completed" | "failed" | "canceled";

    let repositoryId: number;

    async function addActivity(
        options: {
            type?: ActivityType;
            status?: ActivityStatus;
            targetIid?: number;
            repositoryId?: number;
            headSha?: string | null;
        } = {},
    ) {
        await db.insert(activityTable).values({
            repositoryId: options.repositoryId ?? repositoryId,
            repositoryPath: "group/repo",
            provider: "github",
            modelName: "test-model",
            type: options.type ?? "pr_review",
            status: options.status ?? "started",
            targetIid: options.targetIid ?? 8,
            headSha: options.headSha === undefined ? undefined : options.headSha,
            logVersion: "1",
        });
    }

    beforeEach(async () => {
        await db.delete(activityTable);
        await db.delete(repositoryTable);
        const [repository] = await db
            .insert(repositoryTable)
            .values({ path: "group/repo", provider: "github" })
            .returning({ id: repositoryTable.id });
        repositoryId = repository.id;
    });

    describe("hasRunningOrCompletedPullRequestReview", () => {
        it("is true for started and completed reviews", async () => {
            for (const status of ["started", "completed"] as const) {
                await db.delete(activityTable);
                await addActivity({ status });

                expect(await service.hasRunningOrCompletedPullRequestReview(repositoryId, 8)).toBe(true);
            }
        });

        it("is false for failed and canceled reviews", async () => {
            for (const status of ["failed", "canceled"] as const) {
                await db.delete(activityTable);
                await addActivity({ status });

                expect(await service.hasRunningOrCompletedPullRequestReview(repositoryId, 8)).toBe(false);
            }
        });

        it("is true when the only completed review has no headSha", async () => {
            await addActivity({ status: "completed", headSha: null });

            expect(await service.hasRunningOrCompletedPullRequestReview(repositoryId, 8)).toBe(true);
        });

        it("ignores another activity type, another pull request and another repository", async () => {
            await addActivity({ type: "pr_reply", status: "started" });
            await addActivity({ type: "issue_reply", status: "started" });
            await addActivity({ targetIid: 9, status: "started" });

            const [otherRepository] = await db
                .insert(repositoryTable)
                .values({ path: "group/other", provider: "github" })
                .returning({ id: repositoryTable.id });
            await addActivity({ repositoryId: otherRepository.id, status: "started" });

            expect(await service.hasRunningOrCompletedPullRequestReview(repositoryId, 8)).toBe(false);
        });

        it("is true while the only review of that pull request is still running", async () => {
            await addActivity({ status: "started" });

            expect(await service.hasRunningOrCompletedPullRequestReview(repositoryId, 8)).toBe(true);
        });
    });

    describe("findLastReviewedHeadSha", () => {
        it("returns the headSha of a newer started review over an older completed one", async () => {
            const h0 = "a".repeat(40);
            const h1 = "b".repeat(40);
            await addActivity({ status: "completed", headSha: h0 });
            await addActivity({ status: "started", headSha: h1 });

            expect(await service.findLastReviewedHeadSha(repositoryId, 8)).toBe(h1);
        });

        it("ignores failed reviews when picking the last head", async () => {
            const failedHead = "c".repeat(40);
            const h0 = "a".repeat(40);
            await addActivity({ status: "failed", headSha: failedHead });
            await addActivity({ status: "completed", headSha: h0 });

            expect(await service.findLastReviewedHeadSha(repositoryId, 8)).toBe(h0);
        });
    });
}
