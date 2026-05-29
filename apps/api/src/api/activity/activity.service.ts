import { activityTable, modelTable, repositoryTable } from "@proval/db";
import type { Activity, Pagination } from "@proval/types";
import db from "../../db/index.js";
import { count, desc, eq, getTableColumns } from "drizzle-orm";

export type ActivityStartInput = Pick<Activity, "repositoryId" | "modelId" | "type" | "targetIid">;

export type ActivityCompleteOptions = Pick<Activity, "inputToken" | "outputToken">;

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
