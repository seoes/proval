import { and, asc, eq } from "drizzle-orm";
import { activityTable, modelProviderTable } from "@proval/db";
import type { ActivityStartInput } from "./activity.service.js";
import { ActivityService } from "./activity.service.js";
import db from "../../db/index.js";
import { logError } from "../../util/log.js";

function isUniqueConstraintError(error: unknown): boolean {
    return error instanceof Error && error.message.includes("UNIQUE constraint failed");
}

class ActivityQueue {
    private isDraining = false;
    private hasPendingDrain = false;

    public async push(input: ActivityStartInput): Promise<number> {
        for (let attempt = 0; attempt < 3; attempt++) {
            if (input.type === "pr_review") {
                const queuedPullRequestReview = await this.findPullRequestReview(
                    input.repositoryId,
                    input.targetIid,
                    "queued",
                );
                if (queuedPullRequestReview) {
                    if (!input.headSha || queuedPullRequestReview.headSha === input.headSha) {
                        return queuedPullRequestReview.id;
                    }
                    const updated = await db
                        .update(activityTable)
                        .set({ headSha: input.headSha })
                        .where(
                            and(
                                eq(activityTable.id, queuedPullRequestReview.id),
                                eq(activityTable.status, "queued"),
                            ),
                        )
                        .returning({ id: activityTable.id });
                    if (updated.length > 0) return queuedPullRequestReview.id;
                }
                const startedPullRequestReview = await this.findPullRequestReview(
                    input.repositoryId,
                    input.targetIid,
                    "started",
                );
                if (startedPullRequestReview?.headSha === input.headSha) return startedPullRequestReview.id;
            }

            try {
                return await new ActivityService().start(input, "queued");
            } catch (error) {
                if (input.type !== "pr_review" || !isUniqueConstraintError(error) || attempt === 2) throw error;
                continue;
            }
        }
        throw new Error("Failed to queue pull request review");
    }

    public drain(): void {
        if (this.isDraining) {
            this.hasPendingDrain = true;
            return;
        }
        this.isDraining = true;
        void this.drainLoop();
    }

    private async drainLoop(): Promise<void> {
        try {
            do {
                this.hasPendingDrain = false;
                const executableQueuedActivityList = await this.findExecutableQueuedActivity();
                if (executableQueuedActivityList.length === 0 && !this.hasPendingDrain) return;

                let isActivityStarted = false;
                for (const executableQueuedActivity of executableQueuedActivityList) {
                    const startedActivityList = await this.startQueuedActivity(executableQueuedActivity.id);
                    if (startedActivityList.length === 0) {
                        this.hasPendingDrain = true;
                        continue;
                    }
                    isActivityStarted = true;
                }
                if (!isActivityStarted && !this.hasPendingDrain) return;
            } while (true);
        } finally {
            this.isDraining = false;
            if (this.hasPendingDrain) this.drain();
        }
    }

    private async findExecutableQueuedActivity() {
        const queuedActivityList = await db
            .select({
                id: activityTable.id,
                type: activityTable.type,
                repositoryId: activityTable.repositoryId,
                targetIid: activityTable.targetIid,
                modelProviderId: activityTable.modelProviderId,
            })
            .from(activityTable)
            .where(eq(activityTable.status, "queued"))
            .orderBy(asc(activityTable.createdAt), asc(activityTable.id));

        const modelProviderList = await db
            .select({
                id: modelProviderTable.id,
                activityConcurrency: modelProviderTable.activityConcurrency,
            })
            .from(modelProviderTable);
        const activityConcurrencyByProviderId = new Map(
            modelProviderList.map((modelProvider) => [modelProvider.id, modelProvider.activityConcurrency]),
        );

        const runningActivityList = await db
            .select({ modelProviderId: activityTable.modelProviderId })
            .from(activityTable)
            .where(eq(activityTable.status, "started"));
        const runningCountByProviderId = new Map<number, number>();
        for (const runningActivity of runningActivityList) {
            if (runningActivity.modelProviderId == null) continue;
            runningCountByProviderId.set(
                runningActivity.modelProviderId,
                (runningCountByProviderId.get(runningActivity.modelProviderId) ?? 0) + 1,
            );
        }

        const startedPullRequestReviewList = await db
            .select({ repositoryId: activityTable.repositoryId, targetIid: activityTable.targetIid })
            .from(activityTable)
            .where(and(eq(activityTable.type, "pr_review"), eq(activityTable.status, "started")));
        const startedPullRequestReviewKeySet = new Set(
            startedPullRequestReviewList.map(
                (startedPullRequestReview) =>
                    `${startedPullRequestReview.repositoryId}:${startedPullRequestReview.targetIid}`,
            ),
        );

        const executableQueuedActivityList = [];
        for (const queuedActivity of queuedActivityList) {
            if (queuedActivity.modelProviderId == null) continue;
            const activityConcurrency = activityConcurrencyByProviderId.get(queuedActivity.modelProviderId);
            const runningActivityCount = runningCountByProviderId.get(queuedActivity.modelProviderId) ?? 0;
            if (activityConcurrency != null && runningActivityCount >= activityConcurrency) continue;
            const pullRequestReviewKey = `${queuedActivity.repositoryId}:${queuedActivity.targetIid}`;
            if (queuedActivity.type === "pr_review" && startedPullRequestReviewKeySet.has(pullRequestReviewKey)) {
                continue;
            }
            executableQueuedActivityList.push(queuedActivity);
            runningCountByProviderId.set(queuedActivity.modelProviderId, runningActivityCount + 1);
            if (queuedActivity.type === "pr_review") startedPullRequestReviewKeySet.add(pullRequestReviewKey);
        }
        return executableQueuedActivityList;
    }

    private async startQueuedActivity(executableQueuedActivityId: number) {
        try {
            const startedActivityList = await db
                .update(activityTable)
                .set({ status: "started" })
                .where(and(eq(activityTable.id, executableQueuedActivityId), eq(activityTable.status, "queued")))
                .returning({ id: activityTable.id });
            if (startedActivityList.length === 0) return [];
            void new ActivityService()
                .runStarted(executableQueuedActivityId)
                .catch((error) => logError("Activity failed", error))
                .finally(() => this.drain());
            return startedActivityList;
        } catch (error) {
            if (isUniqueConstraintError(error)) return [];
            throw error;
        }
    }

    private async findPullRequestReview(repositoryId: number, targetIid: number, status: "queued" | "started") {
        const [pullRequestReview] = await db
            .select({ id: activityTable.id, headSha: activityTable.headSha })
            .from(activityTable)
            .where(
                and(
                    eq(activityTable.repositoryId, repositoryId),
                    eq(activityTable.targetIid, targetIid),
                    eq(activityTable.type, "pr_review"),
                    eq(activityTable.status, status),
                ),
            )
            .limit(1);
        return pullRequestReview;
    }
}

export const activityQueue = new ActivityQueue();
