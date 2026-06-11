import { activityTable, repositoryTable } from "@proval/db";
import type { Activity, ActivityLast24HoursStats, Pagination } from "@proval/types";
import db from "../../db/index.js";
import { and, count, desc, eq, gte, inArray, sql } from "drizzle-orm";

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
    public async findAll(input: { page: number; limit: number }): Promise<Pagination<Activity>> {
        const { page, limit } = input;
        const offset = (page - 1) * limit;

        const [{ total }] = await db.select({ total: count() }).from(activityTable);

        const itemList = await db
            .select()
            .from(activityTable)
            .orderBy(...listOrderBy)
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
            .select()
            .from(activityTable)
            .where(eq(activityTable.status, "started"))
            .orderBy(desc(activityTable.createdAt), desc(activityTable.id))
            .limit(limit);
    }

    public async findById(id: number): Promise<Activity> {
        const rows = await db
            .select()
            .from(activityTable)
            .where(eq(activityTable.id, id))
            .limit(1);

        if (rows.length === 0) {
            throw new Error("Activity not found");
        }

        return rows[0];
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
