import type { ActivityTokenUsage } from "@proval/types";
import { JobCanceledError } from "../../agent/llm/loop.js";
import { ActivityService } from "./activity.service.js";
import { logError } from "../../util/log.js";

export async function runWithActivity(
    activityId: number,
    run: (activityId: number) => Promise<ActivityTokenUsage>,
): Promise<void> {
    const activityService = new ActivityService();
    try {
        const tokenUsage = await run(activityId);
        await activityService.complete(activityId, tokenUsage);
    } catch (error) {
        if (error instanceof JobCanceledError) {
            return;
        }
        const errorMessage = error instanceof Error ? error.message : String(error);
        try {
            await activityService.fail(activityId, errorMessage);
        } catch (activityError) {
            logError("Activity fail failed", activityError);
        }
        throw error;
    }
}
