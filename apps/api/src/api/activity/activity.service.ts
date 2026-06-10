import { activityTable, modelTable, repositoryTable } from "@proval/db";
import type { Activity, ActivityLast24HoursStats, Pagination } from "@proval/types";
import db from "../../db/index.js";
import { and, count, desc, eq, getTableColumns, gte, inArray } from "drizzle-orm";

const FINISHED_STATUSES = ["completed", "failed"] as const;
const REVIEW_TYPES = ["pr_review", "issue_open"] as const;
const REPLY_TYPES = ["pr_reply", "issue_reply"] as const;

function last24HoursSince(): Date {
    return new Date(Date.now() - 24 * 60 * 60 * 1000);
}

function finishedInLast24Hours() {
    return and(
        gte(activityTable.completedAt, last24HoursSince()),
        inArray(activityTable.status, [...FINISHED_STATUSES]),
    );
}

export type ActivityStartInput = Pick<Activity, "repositoryId" | "modelId" | "type" | "targetIid">;

export type ActivityCompleteOptions = Pick<Activity, "inputToken" | "cachedInputToken" | "outputToken">;

const activitySelect = {
    ...getTableColumns(activityTable),
    repositoryPath: repositoryTable.path,
    modelLabel: modelTable.label,
    provider: repositoryTable.provider,
};

export class ActivityService {
    public async findAll(input: { page: number; limit: number }): Promise<Pagination<Activity>> {
        const { page, limit } = input;
        const offset = (page - 1) * limit;

        const [{ total }] = await db.select({ total: count() }).from(activityTable);

        const itemList = await db
            .select(activitySelect)
            .from(activityTable)
            .innerJoin(repositoryTable, eq(activityTable.repositoryId, repositoryTable.id))
            .innerJoin(modelTable, eq(activityTable.modelId, modelTable.id))
            .orderBy(desc(activityTable.createdAt))
            .limit(limit)
            .offset(offset);

        return { itemList, page, limit, total };
    }

    public async getLast24HoursStats(): Promise<ActivityLast24HoursStats> {
        const since = last24HoursSince();
        const finished = finishedInLast24Hours();

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

    public async findInProgress(limit = 10): Promise<Activity[]> {
        return db
            .select(activitySelect)
            .from(activityTable)
            .innerJoin(repositoryTable, eq(activityTable.repositoryId, repositoryTable.id))
            .innerJoin(modelTable, eq(activityTable.modelId, modelTable.id))
            .where(eq(activityTable.status, "started"))
            .orderBy(desc(activityTable.createdAt))
            .limit(limit);
    }

    public async findById(id: number): Promise<Activity> {
        const rows = await db
            .select(activitySelect)
            .from(activityTable)
            .innerJoin(repositoryTable, eq(activityTable.repositoryId, repositoryTable.id))
            .innerJoin(modelTable, eq(activityTable.modelId, modelTable.id))
            .where(eq(activityTable.id, id))
            .limit(1);

        if (rows.length === 0) {
            throw new Error("Activity not found");
        }

        return rows[0];
    }

    public async start(input: ActivityStartInput): Promise<number> {
        const result = await db
            .insert(activityTable)
            .values({
                ...input,
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
