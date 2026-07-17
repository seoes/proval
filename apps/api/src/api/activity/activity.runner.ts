import type { ActivityTokenUsage } from "@proval/types";
import { ActivityService, type ActivityStartInput } from "./activity.service";
import { activityLog } from "../../util/activity-log.js";
import { logError } from "../../util/log";

export async function runWithActivity(
    input: ActivityStartInput,
    run: (activityId: number) => Promise<ActivityTokenUsage>,
): Promise<void> {
    const activityService = new ActivityService();
    const activityId = await activityService.start(input);
    activityLog(
        activityId,
        "info",
        "lifecycle",
        `started ${input.type} target=${input.targetIid}`,
    );
    try {
        const tokenUsage = await run(activityId);
        await activityService.complete(activityId, tokenUsage);
        activityLog(activityId, "info", "lifecycle", "completed");
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        try {
            await activityService.fail(activityId, errorMessage);
            activityLog(activityId, "error", "lifecycle", `failed: ${errorMessage}`);
        } catch (activityError) {
            logError("Activity fail failed", activityError);
        }
        throw error;
    }
}
