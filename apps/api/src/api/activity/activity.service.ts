import { activityTable } from "@proval/db";
import type { Activity } from "@proval/types";
import db from "../../db/index.js";
import { eq } from "drizzle-orm";

export type ActivityStartInput = Pick<Activity, "repositoryId" | "modelId" | "type" | "targetIid">;

export type ActivityCompleteOptions = Pick<Activity, "inputToken" | "outputToken">;

export class ActivityService {
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
