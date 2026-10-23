import { activityTable, repositoryTable, type ActivityLogEntryJson } from "@proval/db";
import type {
    Activity,
    ActivityLogEntry,
    ActivityLogResponse,
    ActivityStatusResponse,
    CommonLogEntry,
    ActivityResponse,
    ActivityStats,
    ActivityTokenUsage,
    DashboardRange,
    Pagination,
    TokenBreakdownItem,
    TokenSeriesPoint,
} from "@proval/types";
import db from "../../db/index.js";
import { and, count, desc, eq, getTableColumns, gte, inArray, isNotNull, lt, ne, sql, type SQL } from "drizzle-orm";
import { JobCanceledError } from "../../agent/llm/loop.js";
import { createModelProviderSender } from "../model/model.service.js";
import { runPullRequestReply, runPullRequestReview } from "../../agent/pull-request/index.js";
import { runIssueReply, runIssueReplyOnOpen } from "../../agent/issue/index.js";
import type { GitEmojiTarget } from "../../git-provider/types.js";
import { Workspace } from "../../git-provider/workspace.js";
import { logError } from "../../util/log.js";
import { ModelProviderService } from "../model/model.service.js";
import { RepositoryService } from "../repository/repository.service.js";
import { runWithActivity } from "./activity.runner.js";
import { activityQueue } from "./activity.queue.js";

const RETRY_TYPES = ["pr_review", "pr_reply", "issue_open", "issue_reply"] as const;
type RetryActivityType = (typeof RETRY_TYPES)[number];

const FINISHED_STATUSES = ["completed", "failed", "canceled"] as const;

const { logs: _, ...activityWithoutLogs } = getTableColumns(activityTable);

const REVIEW_TYPES = ["pr_review", "issue_open"] as const;
const REPLY_TYPES = ["pr_reply", "issue_reply"] as const;

const DASHBOARD_RANGES = ["24h", "7d", "30d", "mtd", "year"] as const;

export type TokenBucket = "hour" | "day" | "month";

export type ResolvedRange = {
    range: DashboardRange;
    since: Date;
    bucket: TokenBucket;
};

export function parseDashboardRange(value: string | undefined): DashboardRange {
    if (value && (DASHBOARD_RANGES as readonly string[]).includes(value)) {
        return value as DashboardRange;
    }
    return "24h";
}

export function resolveRange(range: DashboardRange, now = new Date()): ResolvedRange {
    switch (range) {
        case "24h":
            return {
                range,
                since: new Date(now.getTime() - 24 * 60 * 60 * 1000),
                bucket: "hour",
            };
        case "7d":
            return {
                range,
                since: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
                bucket: "day",
            };
        case "30d":
            return {
                range,
                since: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
                bucket: "day",
            };
        case "mtd":
            return {
                range,
                since: new Date(now.getFullYear(), now.getMonth(), 1),
                bucket: "day",
            };
        case "year":
            return {
                range,
                since: new Date(now.getFullYear(), 0, 1),
                bucket: "month",
            };
    }
}

function finishedSince(since: Date) {
    return and(gte(activityTable.completedAt, since), inArray(activityTable.status, [...FINISHED_STATUSES]));
}

function withRepositoryFilter(condition: SQL | undefined, repositoryId?: number): SQL | undefined {
    if (repositoryId == null) {
        return condition;
    }
    const repoCondition = eq(activityTable.repositoryId, repositoryId);
    return condition ? and(condition, repoCondition) : repoCondition;
}

function finishedSinceForRepository(since: Date, repositoryId?: number) {
    return withRepositoryFilter(finishedSince(since), repositoryId);
}

function finishedActivityWhere(since: Date, repositoryId?: number) {
    return withRepositoryFilter(
        and(gte(activityTable.completedAt, since), inArray(activityTable.status, [...FINISHED_STATUSES])),
        repositoryId,
    );
}

function startOfHour(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours());
}

function startOfDay(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function startOfMonth(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addHours(date: Date, hours: number): Date {
    return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function addDays(date: Date, days: number): Date {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
}

function addMonths(date: Date, months: number): Date {
    return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function buildBucketStarts(since: Date, bucket: TokenBucket, now: Date): Date[] {
    const starts: Date[] = [];
    if (bucket === "hour") {
        let cursor = startOfHour(since);
        const end = startOfHour(now);
        while (cursor <= end) {
            starts.push(new Date(cursor));
            cursor = addHours(cursor, 1);
        }
        return starts;
    }
    if (bucket === "day") {
        let cursor = startOfDay(since);
        const end = startOfDay(now);
        while (cursor <= end) {
            starts.push(new Date(cursor));
            cursor = addDays(cursor, 1);
        }
        return starts;
    }
    let cursor = startOfMonth(since);
    const end = startOfMonth(now);
    while (cursor <= end) {
        starts.push(new Date(cursor));
        cursor = addMonths(cursor, 1);
    }
    return starts;
}

function bucketKey(date: Date, bucket: TokenBucket): number {
    if (bucket === "hour") return startOfHour(date).getTime();
    if (bucket === "day") return startOfDay(date).getTime();
    return startOfMonth(date).getTime();
}

export type ActivityStartInput = {
    repositoryId: number;
    modelProviderId: number;
    modelName: string;
    type: Activity["type"];
    targetIid: number;
    targetCommentId?: number | null;
    targetInlineReviewId?: string | null;
    headSha?: string | null;
};

export type ActivityCompleteOptions = Pick<Activity, "inputToken" | "cachedInputToken" | "outputToken">;

type ActivityListFilter = {
    statusList?: Activity["status"][];
    typeList?: Activity["type"][];
    repositoryIdList?: number[];
    from?: Date;
    to?: Date;
};

function buildActivityListWhere(filter: ActivityListFilter): SQL | undefined {
    const conditionList: SQL[] = [];
    const { statusList, typeList, repositoryIdList, from, to } = filter;
    if (statusList?.length) {
        conditionList.push(inArray(activityTable.status, statusList));
    }
    if (typeList?.length) {
        conditionList.push(inArray(activityTable.type, typeList));
    }
    if (repositoryIdList?.length) {
        conditionList.push(inArray(activityTable.repositoryId, repositoryIdList));
    }
    if (from) {
        conditionList.push(gte(activityTable.createdAt, from));
    }
    if (to) {
        conditionList.push(lt(activityTable.createdAt, to));
    }
    if (conditionList.length === 0) {
        return undefined;
    }
    return and(...conditionList);
}

function isActivityLogEntry(entry: ActivityLogEntryJson): entry is ActivityLogEntry {
    if (typeof entry.label !== "string") return false;
    if (entry.type === "common") return true;
    return (
        (entry.type === "tool-call" ||
            entry.type === "tool-result" ||
            (entry.type === "tool-error" && entry.level === "error")) &&
        typeof entry.toolName === "string" &&
        entry.toolName.length > 0 &&
        typeof entry.toolCallId === "string" &&
        entry.toolCallId.length > 0
    );
}

function convertLegacyActivityLog(entry: ActivityLogEntryJson): CommonLogEntry {
    return {
        type: "common",
        timestamp: entry.timestamp,
        level: entry.level,
        label: entry.label ?? entry.step ?? "log",
        message: entry.message,
    };
}

const listOrderBy = [
    sql`CASE WHEN ${activityTable.status} = 'started' THEN 0 ELSE 1 END`,
    desc(activityTable.createdAt),
    desc(activityTable.id),
] as const;

/**
 * A reply created before the retry support does not carry the comment it answered.
 * Recover it from the stored agent log so an old failed reply can still be replayed.
 * Only the conversation fetch tools are read, an inline review needs a discussion id
 * that the log does not keep.
 */
function buildEyesEmojiTarget(activity: ActivityResponse): GitEmojiTarget | null {
    switch (activity.type) {
        case "pr_review":
            return { type: "pull_request", prIid: activity.targetIid };
        case "issue_open":
            return { type: "issue", issueIid: activity.targetIid };
        case "pr_reply": {
            const commentId = activity.targetCommentId;
            if (commentId == null) return null;
            if (activity.targetInlineReviewId != null) {
                return { type: "inline_review_comment", prIid: activity.targetIid, commentId };
            }
            return { type: "pull_request_comment", prIid: activity.targetIid, commentId };
        }
        case "issue_reply": {
            const commentId = activity.targetCommentId;
            if (commentId == null) return null;
            return { type: "issue_comment", issueIid: activity.targetIid, commentId };
        }
        default:
            return null;
    }
}

export function recoverLegacyReplyTargetComment(): number {
    const result = db.$client.run(`
        UPDATE activity
        SET target_comment_id = (
            SELECT CASE
                    WHEN json_valid(json_extract(entry.value, '$.message'))
                    THEN json_extract(json_extract(entry.value, '$.message'), '$.commentId')
                END
            FROM json_each(activity.logs) AS entry
            WHERE json_extract(entry.value, '$.type') = 'tool-call'
              AND json_extract(entry.value, '$.toolName') IN ('get_pull_request_comment', 'get_issue_comment')
              AND CASE
                      WHEN json_valid(json_extract(entry.value, '$.message'))
                      THEN json_extract(json_extract(entry.value, '$.message'), '$.commentId')
                  END IS NOT NULL
            ORDER BY entry.key
            LIMIT 1
        )
        WHERE type IN ('pr_reply', 'issue_reply')
          AND target_comment_id IS NULL
          AND json_valid(logs)
          AND EXISTS (
              SELECT 1
              FROM json_each(activity.logs) AS entry
              WHERE json_extract(entry.value, '$.type') = 'tool-call'
                AND json_extract(entry.value, '$.toolName') IN ('get_pull_request_comment', 'get_issue_comment')
                AND CASE
                        WHEN json_valid(json_extract(entry.value, '$.message'))
                        THEN json_extract(json_extract(entry.value, '$.message'), '$.commentId')
                    END IS NOT NULL
          )
    `);
    return result.changes;
}

export class ActivityService {
    private async addEyesEmoji(activityId: number): Promise<void> {
        try {
            const activity = await this.findById(activityId);
            if (activity?.repositoryId == null) return;
            if (activity.status !== "queued" && activity.status !== "started") return;

            const emojiTarget = buildEyesEmojiTarget(activity);
            if (emojiTarget == null) return;
            const gitProvider = await new RepositoryService().createGitProvider(activity.repositoryId);
            await gitProvider.addEmoji(emojiTarget, "👀");

            const current = await this.findById(activityId);
            if (current?.status === "queued" || current?.status === "started") return;
            await this.removeEyesEmoji(activityId);
        } catch (error) {
            logError("add emoji failed", error);
        }
    }

    private async removeEyesEmoji(activityId: number): Promise<void> {
        const activity = await this.findById(activityId);
        if (activity?.repositoryId == null) {
            return;
        }

        const emojiTarget = buildEyesEmojiTarget(activity);
        if (emojiTarget == null) {
            return;
        }

        const gitProvider = await new RepositoryService().createGitProvider(activity.repositoryId);
        if (await this.hasQueuedOrStartedActivity(activityId)) {
            return;
        }

        await gitProvider.removeEmoji(emojiTarget, "👀");
    }

    public async findAll(
        input: { page: number; limit: number } & ActivityListFilter,
    ): Promise<Pagination<ActivityResponse>> {
        const { page, limit, statusList, typeList, repositoryIdList, from, to } = input;
        const offset = (page - 1) * limit;
        const where = buildActivityListWhere({ statusList, typeList, repositoryIdList, from, to });

        const [{ total }] = await db.select({ total: count() }).from(activityTable).where(where);

        const itemList = await db
            .select(activityWithoutLogs)
            .from(activityTable)
            .where(where)
            .orderBy(...listOrderBy)
            .limit(limit)
            .offset(offset);

        return { itemList, page, limit, total };
    }

    public async getStats(since: Date, repositoryId?: number): Promise<ActivityStats> {
        const finished = finishedSinceForRepository(since, repositoryId);
        const failedSince = withRepositoryFilter(
            and(gte(activityTable.completedAt, since), eq(activityTable.status, "failed")),
            repositoryId,
        );

        const [[{ total: totalActivity }], [{ total: errors }], [{ total: reviews }], [{ total: replies }]] =
            await Promise.all([
                db.select({ total: count() }).from(activityTable).where(finished),
                db.select({ total: count() }).from(activityTable).where(failedSince),
                db
                    .select({ total: count() })
                    .from(activityTable)
                    .where(and(finished, inArray(activityTable.type, [...REVIEW_TYPES]))),
                db
                    .select({ total: count() })
                    .from(activityTable)
                    .where(and(finished, inArray(activityTable.type, [...REPLY_TYPES]))),
            ]);

        return { totalActivity, errors, reviews, replies };
    }

    public async findRecent(since: Date, limit = 5, repositoryId?: number): Promise<ActivityResponse[]> {
        return db
            .select(activityWithoutLogs)
            .from(activityTable)
            .where(finishedSinceForRepository(since, repositoryId))
            .orderBy(desc(activityTable.completedAt), desc(activityTable.id))
            .limit(limit);
    }

    public async getTokenSeries(
        since: Date,
        bucket: TokenBucket,
        now = new Date(),
        repositoryId?: number,
    ): Promise<TokenSeriesPoint[]> {
        const bucketStarts = buildBucketStarts(since, bucket, now);
        const rowLowerBound = bucketStarts[0] ?? since;
        type BucketTotals = { inputToken: number; outputToken: number; cachedInputToken: number };
        const totals = new Map<number, BucketTotals>();
        for (const start of bucketStarts) {
            totals.set(start.getTime(), { inputToken: 0, outputToken: 0, cachedInputToken: 0 });
        }

        const rows = await db
            .select({
                completedAt: activityTable.completedAt,
                inputToken: activityTable.inputToken,
                cachedInputToken: activityTable.cachedInputToken,
                outputToken: activityTable.outputToken,
            })
            .from(activityTable)
            .where(finishedActivityWhere(rowLowerBound, repositoryId));

        for (const row of rows) {
            if (!row.completedAt) continue;
            const key = bucketKey(row.completedAt, bucket);
            const bucketTotals = totals.get(key);
            if (!bucketTotals) continue;
            bucketTotals.inputToken += row.inputToken ?? 0;
            bucketTotals.outputToken += row.outputToken ?? 0;
            bucketTotals.cachedInputToken += row.cachedInputToken ?? 0;
        }

        return bucketStarts.map((start) => {
            const bucketTotals = totals.get(start.getTime()) ?? { inputToken: 0, outputToken: 0, cachedInputToken: 0 };
            const tokens = bucketTotals.inputToken + bucketTotals.outputToken;
            return {
                bucketStart: start.toISOString(),
                tokens,
                inputToken: bucketTotals.inputToken,
                outputToken: bucketTotals.outputToken,
                cachedInputToken: bucketTotals.cachedInputToken,
            };
        });
    }

    public async getTokenBreakdownByModel(
        since: Date,
        limit = 5,
        repositoryId?: number,
    ): Promise<TokenBreakdownItem[]> {
        const tokenSum = sql<number>`sum(coalesce(${activityTable.inputToken}, 0) + coalesce(${activityTable.outputToken}, 0))`;
        const rows = await db
            .select({
                label: activityTable.modelName,
                tokens: tokenSum.mapWith(Number),
            })
            .from(activityTable)
            .where(finishedActivityWhere(since, repositoryId))
            .groupBy(activityTable.modelName)
            .orderBy(desc(tokenSum))
            .limit(limit);

        return rows.map((row) => ({ label: row.label, tokens: row.tokens ?? 0 }));
    }

    public async getTokenBreakdownByRepository(since: Date, limit = 5): Promise<TokenBreakdownItem[]> {
        const tokenSum = sql<number>`sum(coalesce(${activityTable.inputToken}, 0) + coalesce(${activityTable.outputToken}, 0))`;
        const rows = await db
            .select({
                label: activityTable.repositoryPath,
                tokens: tokenSum.mapWith(Number),
            })
            .from(activityTable)
            .where(and(gte(activityTable.completedAt, since), inArray(activityTable.status, [...FINISHED_STATUSES])))
            .groupBy(activityTable.repositoryPath)
            .orderBy(desc(tokenSum))
            .limit(limit);

        return rows.map((row) => ({ label: row.label, tokens: row.tokens ?? 0 }));
    }

    public async findInProgress(limit = 10): Promise<ActivityResponse[]> {
        return db
            .select(activityWithoutLogs)
            .from(activityTable)
            .where(inArray(activityTable.status, ["queued", "started"]))
            .orderBy(desc(activityTable.createdAt), desc(activityTable.id))
            .limit(limit);
    }

    public async findById(id: number): Promise<ActivityResponse | null> {
        const rows = await db.select(activityWithoutLogs).from(activityTable).where(eq(activityTable.id, id)).limit(1);

        if (rows.length === 0) {
            return null;
        }

        return rows[0];
    }

    public async findStatusById(id: number): Promise<ActivityStatusResponse | null> {
        const rows = await db
            .select({
                status: activityTable.status,
                startedAt: activityTable.startedAt,
                completedAt: activityTable.completedAt,
                errorMessage: activityTable.errorMessage,
                inputToken: activityTable.inputToken,
                cachedInputToken: activityTable.cachedInputToken,
                outputToken: activityTable.outputToken,
            })
            .from(activityTable)
            .where(eq(activityTable.id, id))
            .limit(1);

        return rows[0] ?? null;
    }

    public async isCanceled(id: number): Promise<boolean> {
        const activity = await this.findById(id);
        return activity?.status === "canceled";
    }

    public async findLastReviewedHeadSha(repositoryId: number, targetIid: number): Promise<string | null> {
        const rows = await db
            .select({ headSha: activityTable.headSha })
            .from(activityTable)
            .where(
                and(
                    eq(activityTable.repositoryId, repositoryId),
                    eq(activityTable.targetIid, targetIid),
                    eq(activityTable.type, "pr_review"),
                    eq(activityTable.status, "completed"),
                    isNotNull(activityTable.headSha),
                ),
            )
            .orderBy(desc(activityTable.completedAt), desc(activityTable.id))
            .limit(1);
        return rows[0]?.headSha ?? null;
    }

    public async hasCompletedPullRequestReview(repositoryId: number, targetIid: number): Promise<boolean> {
        const [{ total }] = await db
            .select({ total: count() })
            .from(activityTable)
            .where(
                and(
                    eq(activityTable.repositoryId, repositoryId),
                    eq(activityTable.targetIid, targetIid),
                    eq(activityTable.type, "pr_review"),
                    eq(activityTable.status, "completed"),
                ),
            );
        return total > 0;
    }

    public async hasQueuedOrStartedPullRequestReview(repositoryId: number, targetIid: number): Promise<boolean> {
        const [openPullRequestReviewCount] = await db
            .select({ total: count() })
            .from(activityTable)
            .where(
                and(
                    eq(activityTable.repositoryId, repositoryId),
                    eq(activityTable.targetIid, targetIid),
                    eq(activityTable.type, "pr_review"),
                    inArray(activityTable.status, ["queued", "started"]),
                ),
            );
        return openPullRequestReviewCount.total > 0;
    }

    public async hasQueuedOrStartedActivity(id: number): Promise<boolean> {
        const activity = await this.findById(id);
        if (activity?.repositoryId == null) return false;
        const [openActivityCount] = await db
            .select({ total: count() })
            .from(activityTable)
            .where(
                and(
                    eq(activityTable.repositoryId, activity.repositoryId),
                    eq(activityTable.targetIid, activity.targetIid),
                    eq(activityTable.type, activity.type),
                    inArray(activityTable.status, ["queued", "started"]),
                    ne(activityTable.id, id),
                    activity.targetCommentId == null
                        ? undefined
                        : eq(activityTable.targetCommentId, activity.targetCommentId),
                    activity.targetInlineReviewId == null
                        ? undefined
                        : eq(activityTable.targetInlineReviewId, activity.targetInlineReviewId),
                ),
            );
        return openActivityCount.total > 0;
    }

    public async recordPullRequestHead(id: number, pullRequestHeadSha: string): Promise<void> {
        if (id <= 0) return;
        const activity = await this.findById(id);
        if (activity?.repositoryId == null) return;
        await db.update(activityTable).set({ headSha: pullRequestHeadSha }).where(eq(activityTable.id, id));
        await db
            .update(activityTable)
            .set({
                status: "canceled",
                completedAt: new Date(),
                errorMessage: "Included in the running review",
            })
            .where(
                and(
                    eq(activityTable.repositoryId, activity.repositoryId),
                    eq(activityTable.targetIid, activity.targetIid),
                    eq(activityTable.type, "pr_review"),
                    eq(activityTable.status, "queued"),
                    eq(activityTable.headSha, pullRequestHeadSha),
                ),
            );
    }

    public async findLogListById(id: number, from?: number): Promise<ActivityLogResponse | null> {
        // ponytail: logs live in one JSON column, so a tail read still loads the whole value. A log table is the upgrade if poll CPU matters.
        const respond = (status: Activity["status"], logs: ActivityLogEntry[]): ActivityLogResponse => {
            if (from == null) return { status, logVersion: "1", logs };
            return { status, logVersion: "1", from, logs: logs.slice(from) };
        };

        const rows = await db
            .select({ status: activityTable.status, logVersion: activityTable.logVersion, logs: activityTable.logs })
            .from(activityTable)
            .where(eq(activityTable.id, id))
            .limit(1);

        if (rows.length === 0) {
            return null;
        }

        const logList = rows[0].logs ?? [];
        if (rows[0].logVersion === "1") {
            return respond(rows[0].status, logList as ActivityLogEntry[]);
        }

        // Convert legacy log schema to newer version and save to db
        return db.transaction(
            (tx) => {
                // Read again after taking the write lock to preserve concurrent appends
                const activity = tx
                    .select({
                        status: activityTable.status,
                        logVersion: activityTable.logVersion,
                        logs: activityTable.logs,
                    })
                    .from(activityTable)
                    .where(eq(activityTable.id, id))
                    .get();
                if (!activity) return null;

                const currentLogList = activity.logs ?? [];
                if (activity.logVersion === "1") {
                    return respond(activity.status, currentLogList as ActivityLogEntry[]);
                }
                const convertedLogList = currentLogList.map((entry) =>
                    isActivityLogEntry(entry) ? entry : convertLegacyActivityLog(entry),
                );
                tx.update(activityTable)
                    .set({ logs: convertedLogList, logVersion: "1", updatedAt: sql`${activityTable.updatedAt}` })
                    .where(eq(activityTable.id, id))
                    .run();
                return respond(activity.status, convertedLogList);
            },
            { behavior: "immediate" },
        );
    }

    public async appendLog(id: number, entry: ActivityLogEntry): Promise<void> {
        try {
            // Atomic append in one UPDATE to avoid lost updates under concurrent tool logs.
            const entryJson = JSON.stringify(entry);
            await db
                .update(activityTable)
                .set({ logs: sql`json_insert(${activityTable.logs}, '$[#]', json(${entryJson}))` })
                .where(eq(activityTable.id, id));
        } catch {
            // Logging must never fail the activity run.
        }
    }

    public async start(input: ActivityStartInput, status: "queued" | "started" = "started"): Promise<number> {
        const [repository] = await db
            .select({ path: repositoryTable.path, provider: repositoryTable.provider })
            .from(repositoryTable)
            .where(eq(repositoryTable.id, input.repositoryId));

        if (!repository) {
            throw new Error("Repository not found");
        }

        const result = await db
            .insert(activityTable)
            .values({
                ...input,
                repositoryPath: repository.path,
                provider: repository.provider,
                logVersion: "1",
                status,
                startedAt: status === "started" ? new Date() : null,
            })
            .returning({ id: activityTable.id });

        const id = result[0].id;
        await this.addEyesEmoji(id);
        return id;
    }

    public async addTokenUsage(id: number, delta: ActivityTokenUsage): Promise<void> {
        if (id <= 0) {
            return;
        }
        try {
            await db
                .update(activityTable)
                .set({
                    inputToken: sql`coalesce(${activityTable.inputToken}, 0) + ${delta.inputToken}`,
                    cachedInputToken: sql`coalesce(${activityTable.cachedInputToken}, 0) + ${delta.cachedInputToken}`,
                    outputToken: sql`coalesce(${activityTable.outputToken}, 0) + ${delta.outputToken}`,
                })
                .where(eq(activityTable.id, id));
        } catch (error) {
            logError(`Failed to add token usage for activity ${id}`, error);
        }
    }

    public async complete(id: number, options: ActivityCompleteOptions): Promise<void> {
        const result = await db
            .update(activityTable)
            .set({
                status: "completed",
                inputToken: options.inputToken,
                cachedInputToken: options.cachedInputToken,
                outputToken: options.outputToken,
                completedAt: new Date(),
            })
            .where(and(eq(activityTable.id, id), eq(activityTable.status, "started")))
            .returning({ id: activityTable.id });

        if (result.length === 0) {
            throw new Error("Activity not found");
        }
        void this.removeEyesEmoji(id).catch((error) => logError("remove emoji failed", error));
        activityQueue.drain();
    }

    public async fail(id: number, errorMessage: string): Promise<void> {
        const result = await db
            .update(activityTable)
            .set({
                status: "failed",
                errorMessage,
                completedAt: new Date(),
            })
            .where(and(eq(activityTable.id, id), eq(activityTable.status, "started")))
            .returning({ id: activityTable.id });

        if (result.length === 0) {
            throw new Error("Activity not found");
        }
        void this.removeEyesEmoji(id).catch((error) => logError("remove emoji failed", error));
        activityQueue.drain();
    }

    public async cancel(id: number): Promise<void> {
        const result = await db
            .update(activityTable)
            .set({
                status: "canceled",
                completedAt: new Date(),
            })
            .where(and(eq(activityTable.id, id), inArray(activityTable.status, ["queued", "started"])))
            .returning({ id: activityTable.id });

        if (result.length === 0) {
            const activity = await this.findById(id);
            if (activity === null) {
                throw new Error("Activity not found");
            }
            throw new Error("Only queued or started activities can be canceled");
        }
        void this.removeEyesEmoji(id).catch((error) => logError("remove emoji failed", error));
        activityQueue.drain();
    }

    public async runStarted(id: number): Promise<void> {
        const activity = await this.findById(id);
        if (activity?.status !== "started") return;
        if (activity.repositoryId == null || activity.modelProviderId == null) {
            try {
                await this.fail(id, "Repository or model provider is no longer linked to this activity");
            } catch (error) {
                if (!(error instanceof Error && error.message === "Activity not found")) {
                    logError("Activity fail failed", error);
                }
            }
            return;
        }

        try {
            const repositoryService = new RepositoryService();
            const repository = await repositoryService.findById(activity.repositoryId);
            const modelProvider = await new ModelProviderService().findById(activity.modelProviderId);
            const gitProvider = await repositoryService.createGitProvider(activity.repositoryId);
            const workspace = new Workspace(gitProvider);
            const llmSender = createModelProviderSender(modelProvider, activity.modelName, repository.reasoningEffort);

            if (activity.type === "pr_review") {
                const previousHeadSha = await this.findLastReviewedHeadSha(activity.repositoryId, activity.targetIid);
                if (previousHeadSha && previousHeadSha === activity.headSha) {
                    await this.appendLog(id, {
                        type: "common",
                        timestamp: new Date().toISOString(),
                        level: "info",
                        label: "Setup",
                        message: "Skipped: head already reviewed",
                    });
                    await this.complete(id, { inputToken: 0, cachedInputToken: 0, outputToken: 0 });
                    return;
                }
                await runWithActivity(id, (activityId) =>
                    runPullRequestReview({
                        provider: gitProvider,
                        workspace,
                        llmSender,
                        prIid: activity.targetIid,
                        isInlineReview: repository.prInlineReview,
                        language: repository.language,
                        userPrompt: repository.userPrompt,
                        activityId,
                        isFollowUpReview: previousHeadSha != null,
                        previousHeadSha,
                    }),
                );
                return;
            }

            if (activity.type === "issue_open") {
                await runWithActivity(id, (activityId) =>
                    runIssueReplyOnOpen({
                        provider: gitProvider,
                        workspace,
                        llmSender,
                        issueIid: activity.targetIid,
                        language: repository.language,
                        issueLabelOnOpenEnabled: repository.issueLabelOnOpenEnabled,
                        activityId,
                    }),
                );
                return;
            }

            const commentId = activity.targetCommentId;
            if (commentId == null) throw new Error("This activity has no comment to reply to");

            if (activity.type === "pr_reply") {
                await runWithActivity(id, (activityId) =>
                    runPullRequestReply({
                        provider: gitProvider,
                        workspace,
                        llmSender,
                        prIid: activity.targetIid,
                        commentId,
                        inlineReviewId: activity.targetInlineReviewId,
                        language: repository.language,
                        userPrompt: repository.userPrompt,
                        activityId,
                    }),
                );
                return;
            }

            await runWithActivity(id, (activityId) =>
                runIssueReply({
                    provider: gitProvider,
                    workspace,
                    llmSender,
                    issueIid: activity.targetIid,
                    commentId,
                    language: repository.language,
                    userPrompt: repository.userPrompt,
                    activityId,
                }),
            );
        } catch (error) {
            if (error instanceof JobCanceledError) return;
            const errorMessage = error instanceof Error ? error.message : String(error);
            try {
                await this.fail(id, errorMessage);
            } catch (failError) {
                if (!(failError instanceof Error && failError.message === "Activity not found")) {
                    logError("Activity fail failed", failError);
                }
            }
            throw error;
        }
    }

    public async retry(id: number): Promise<void> {
        const activity = await this.findById(id);
        if (activity === null) {
            throw new Error("Activity not found");
        }
        if (activity.status !== "failed" && activity.status !== "canceled") {
            throw new Error("Only failed or canceled activities can be retried");
        }
        if (!RETRY_TYPES.includes(activity.type as RetryActivityType)) {
            throw new Error("This activity type cannot be retried");
        }

        if (activity.repositoryId == null) {
            throw new Error("Repository is no longer linked to this activity");
        }
        const repositoryService = new RepositoryService();
        const repository = await repositoryService.findById(activity.repositoryId);
        if (repository.modelProviderId == null) {
            throw new Error("Model provider is no longer linked to this activity");
        }

        if (activity.type === "pr_review") {
            if (await this.hasQueuedOrStartedPullRequestReview(activity.repositoryId, activity.targetIid)) {
                throw new Error("A review for this pull request is already queued or running");
            }
        }

        const commentId = activity.targetCommentId;
        if ((activity.type === "pr_reply" || activity.type === "issue_reply") && commentId === null) {
            throw new Error("This activity has no comment to reply to");
        }

        await activityQueue.push({
            repositoryId: activity.repositoryId,
            modelProviderId: repository.modelProviderId,
            modelName: repository.modelName,
            type: activity.type,
            targetIid: activity.targetIid,
            targetCommentId: activity.targetCommentId,
            targetInlineReviewId: activity.targetInlineReviewId,
            headSha: activity.headSha,
        });
        activityQueue.drain();
    }
}
