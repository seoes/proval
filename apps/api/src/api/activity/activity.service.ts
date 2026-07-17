import { activityTable, repositoryTable } from "@proval/db";
import type {
    Activity,
    ActivityLogEntry,
    ActivityLogResponse,
    ActivityResponse,
    ActivityStats,
    DashboardRange,
    Pagination,
    TokenBreakdownItem,
    TokenSeriesPoint,
} from "@proval/types";
import db from "../../db/index.js";
import { and, count, desc, eq, getTableColumns, gte, inArray, sql } from "drizzle-orm";

const MAX_ACTIVITY_LOGS = 200;

const FINISHED_STATUSES = ["completed", "failed"] as const;

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
};

export type ActivityCompleteOptions = Pick<Activity, "inputToken" | "cachedInputToken" | "outputToken">;

const listOrderBy = [
    sql`CASE WHEN ${activityTable.status} = 'started' THEN 0 ELSE 1 END`,
    desc(activityTable.createdAt),
    desc(activityTable.id),
] as const;

export class ActivityService {
    public async findAll(input: { page: number; limit: number }): Promise<Pagination<ActivityResponse>> {
        const { page, limit } = input;
        const offset = (page - 1) * limit;

        const [{ total }] = await db.select({ total: count() }).from(activityTable);

        const itemList = await db
            .select(activityWithoutLogs)
            .from(activityTable)
            .orderBy(...listOrderBy)
            .limit(limit)
            .offset(offset);

        return { itemList, page, limit, total };
    }

    public async getStats(since: Date): Promise<ActivityStats> {
        const finished = finishedSince(since);

        const [[{ total: totalActivity }], [{ total: errors }], [{ total: reviews }], [{ total: replies }]] =
            await Promise.all([
                db.select({ total: count() }).from(activityTable).where(finished),
                db
                    .select({ total: count() })
                    .from(activityTable)
                    .where(and(gte(activityTable.completedAt, since), eq(activityTable.status, "failed"))),
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

    public async findRecent(since: Date, limit = 5): Promise<ActivityResponse[]> {
        return db
            .select(activityWithoutLogs)
            .from(activityTable)
            .where(finishedSince(since))
            .orderBy(desc(activityTable.completedAt), desc(activityTable.id))
            .limit(limit);
    }

    public async getTokenSeries(since: Date, bucket: TokenBucket, now = new Date()): Promise<TokenSeriesPoint[]> {
        const bucketStarts = buildBucketStarts(since, bucket, now);
        const rowLowerBound = bucketStarts[0] ?? since;
        const totals = new Map<number, number>();
        for (const start of bucketStarts) {
            totals.set(start.getTime(), 0);
        }

        const rows = await db
            .select({
                completedAt: activityTable.completedAt,
                inputToken: activityTable.inputToken,
                outputToken: activityTable.outputToken,
            })
            .from(activityTable)
            .where(and(gte(activityTable.completedAt, rowLowerBound), eq(activityTable.status, "completed")));

        for (const row of rows) {
            if (!row.completedAt) continue;
            const key = bucketKey(row.completedAt, bucket);
            if (!totals.has(key)) continue;
            const tokens = (row.inputToken ?? 0) + (row.outputToken ?? 0);
            totals.set(key, (totals.get(key) ?? 0) + tokens);
        }

        return bucketStarts.map((start) => ({
            bucketStart: start.toISOString(),
            tokens: totals.get(start.getTime()) ?? 0,
        }));
    }

    public async getTokenBreakdownByModel(since: Date, limit = 5): Promise<TokenBreakdownItem[]> {
        const tokenSum = sql<number>`sum(coalesce(${activityTable.inputToken}, 0) + coalesce(${activityTable.outputToken}, 0))`;
        const rows = await db
            .select({
                label: activityTable.modelName,
                tokens: tokenSum.mapWith(Number),
            })
            .from(activityTable)
            .where(and(gte(activityTable.completedAt, since), eq(activityTable.status, "completed")))
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
            .where(and(gte(activityTable.completedAt, since), eq(activityTable.status, "completed")))
            .groupBy(activityTable.repositoryPath)
            .orderBy(desc(tokenSum))
            .limit(limit);

        return rows.map((row) => ({ label: row.label, tokens: row.tokens ?? 0 }));
    }

    public async findInProgress(limit = 10): Promise<ActivityResponse[]> {
        return db
            .select(activityWithoutLogs)
            .from(activityTable)
            .where(eq(activityTable.status, "started"))
            .orderBy(desc(activityTable.createdAt), desc(activityTable.id))
            .limit(limit);
    }

    public async findById(id: number): Promise<ActivityResponse> {
        const rows = await db.select(activityWithoutLogs).from(activityTable).where(eq(activityTable.id, id)).limit(1);

        if (rows.length === 0) {
            throw new Error("Activity not found");
        }

        return rows[0];
    }

    public async findLogsById(id: number): Promise<ActivityLogResponse> {
        const rows = await db
            .select({ status: activityTable.status, logs: activityTable.logs })
            .from(activityTable)
            .where(eq(activityTable.id, id))
            .limit(1);

        if (rows.length === 0) {
            throw new Error("Activity not found");
        }

        return { status: rows[0].status, logs: rows[0].logs ?? [] };
    }

    public async appendLog(id: number, entry: ActivityLogEntry): Promise<void> {
        try {
            const rows = await db
                .select({ logs: activityTable.logs })
                .from(activityTable)
                .where(eq(activityTable.id, id))
                .limit(1);

            if (rows.length === 0) {
                return;
            }

            const logs = [...(rows[0].logs ?? []), entry];
            const trimmed = logs.length > MAX_ACTIVITY_LOGS ? logs.slice(logs.length - MAX_ACTIVITY_LOGS) : logs;

            await db.update(activityTable).set({ logs: trimmed }).where(eq(activityTable.id, id));
        } catch {
            // Logging must never fail the activity run.
        }
    }

    public async start(input: ActivityStartInput): Promise<number> {
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
                status: "started",
            })
            .returning({ id: activityTable.id });

        return result[0].id;
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
            .where(eq(activityTable.id, id))
            .returning({ id: activityTable.id });

        if (result.length === 0) {
            throw new Error("Activity not found");
        }
    }

    public async fail(id: number, errorMessage: string): Promise<void> {
        const result = await db
            .update(activityTable)
            .set({
                status: "failed",
                errorMessage,
                completedAt: new Date(),
            })
            .where(eq(activityTable.id, id))
            .returning({ id: activityTable.id });

        if (result.length === 0) {
            throw new Error("Activity not found");
        }
    }
}
