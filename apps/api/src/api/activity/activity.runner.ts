import type { ActivityTokenUsage } from "@proval/types";
import { ActivityService, type ActivityStartInput } from "./activity.service";
import { logError } from "../../util/log";

export async function runWithActivity(
    input: ActivityStartInput,
    run: () => Promise<ActivityTokenUsage>,
): Promise<void> {
    const activityService = new ActivityService();
    const activityId = await activityService.start(input);
    try {
        const tokenUsage = await run();
        await activityService.complete(activityId, tokenUsage);
    } catch (error) {
        try {
            await activityService.fail(activityId, error instanceof Error ? error.message : String(error));
        } catch (activityError) {
            logError("Activity fail failed", activityError);
        }
        throw error;
    }
}
