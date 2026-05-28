import type { ActivityTokenUsage } from "@proval/types";
import { ActivityService, type ActivityStartInput } from "./activity.service";

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
        await activityService.fail(activityId, error instanceof Error ? error.message : String(error));
        throw error;
    }
}
