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
    private isMerging = false;
    private isQueueStoppedForShutdown = false;

    public stopQueueForShutdown(): void {
        this.isQueueStoppedForShutdown = true;
    }

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
                            and(eq(activityTable.id, queuedPullRequestReview.id), eq(activityTable.status, "queued")),
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
        if (this.isQueueStoppedForShutdown || this.isMerging) return;
        if (this.isDraining) {
            this.hasPendingDrain = true;
            return;
        }
        this.isDraining = true;
        void this.drainLoop();
    }

    public async mergeDuplicated(): Promise<void> {
        this.isMerging = true;
        try {
            const startedList = await db
                .select({
                    id: activityTable.id,
                    type: activityTable.type,
                    repositoryId: activityTable.repositoryId,
                    repositoryPath: activityTable.repositoryPath,
                    provider: activityTable.provider,
                    modelProviderId: activityTable.modelProviderId,
                    modelName: activityTable.modelName,
                    reasoningEffort: activityTable.reasoningEffort,
                    targetIid: activityTable.targetIid,
                    targetCommentId: activityTable.targetCommentId,
                    targetInlineReviewId: activityTable.targetInlineReviewId,
                    headSha: activityTable.headSha,
                    createdAt: activityTable.createdAt,
                })
                .from(activityTable)
                .where(eq(activityTable.status, "started"));

            for (const started of startedList) {
                try {
                    if (started.type === "pr_review" && started.repositoryId != null) {
                        const queued = await this.findPullRequestReview(
                            started.repositoryId,
                            started.targetIid,
                            "queued",
                        );
                        if (queued) {
                            await this.closeInterrupted(
                                started.id,
                                "canceled",
                                "Canceled on restart because a queued review will run instead",
                            );
                            continue;
                        }
                    }
                    if (started.repositoryId == null || started.modelProviderId == null) {
                        await this.closeInterrupted(
                            started.id,
                            "failed",
                            "Repository or model provider is no longer linked to this activity",
                        );
                        continue;
                    }
                    const isCanceled = await this.closeInterrupted(
                        started.id,
                        "canceled",
                        "Canceled on restart because this activity was queued again",
                    );
                    if (!isCanceled) continue;
                    await db.insert(activityTable).values({
                        repositoryId: started.repositoryId,
                        repositoryPath: started.repositoryPath,
                        provider: started.provider,
                        modelProviderId: started.modelProviderId,
                        modelName: started.modelName,
                        reasoningEffort: started.reasoningEffort,
                        type: started.type,
                        status: "queued",
                        targetIid: started.targetIid,
                        targetCommentId: started.targetCommentId,
                        targetInlineReviewId: started.targetInlineReviewId,
                        headSha: started.headSha,
                        logVersion: "1",
                        createdAt: started.createdAt,
                    });
                } catch (error) {
                    logError("Failed to requeue interrupted activity", error);
                    await this.closeInterrupted(
                        started.id,
                        "failed",
                        "Server restarted while this activity was running",
                    );
                }
            }
        } finally {
            this.isMerging = false;
        }
    }

    private async drainLoop(): Promise<void> {
        try {
            while (!this.isQueueStoppedForShutdown) {
                this.hasPendingDrain = false;
                const executableQueuedActivityList = await this.findExecutableQueuedActivity();
                if (executableQueuedActivityList.length === 0) break;

                let isActivityStarted = false;
                for (const executableQueuedActivity of executableQueuedActivityList) {
                    const startedActivityList = await this.startQueuedActivity(executableQueuedActivity.id);
                    if (startedActivityList.length === 0) {
                        this.hasPendingDrain = true;
                        continue;
                    }
                    isActivityStarted = true;
                }
                if (!isActivityStarted && !this.hasPendingDrain) break;
            }
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
        if (this.isQueueStoppedForShutdown) return [];
        try {
            const startedActivityList = await db
                .update(activityTable)
                .set({ status: "started", startedAt: new Date() })
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

    private async closeInterrupted(
        id: number,
        status: "canceled" | "failed",
        errorMessage: string,
    ): Promise<boolean> {
        const updated = await db
            .update(activityTable)
            .set({ status, completedAt: new Date(), errorMessage })
            .where(and(eq(activityTable.id, id), eq(activityTable.status, "started")))
            .returning({ id: activityTable.id });
        return updated.length > 0;
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
