import type { ActivityTokenUsage } from "@proval/types";
import { JobCanceledError } from "../../agent/llm/loop.js";
import { ActivityService, type ActivityStartInput } from "./activity.service";
import { logAgent, logError } from "../../util/log";
import { reviewAdmission } from "./admission.js";

/** Pull request reviews are the expensive kind and the only kind the gate holds. */
const GATED_TYPES: ReadonlySet<ActivityStartInput["type"]> = new Set(["pr_review"]);

export async function runWithActivity(
    input: ActivityStartInput,
    run: (activityId: number) => Promise<ActivityTokenUsage>,
): Promise<void> {
    const activityService = new ActivityService();
    const activityId = await activityService.start(input);
    const gate = GATED_TYPES.has(input.type) ? reviewAdmission() : null;
    let admitted = false;
    try {
        if (gate) {
            // The activity row exists before the wait so the dashboard shows the review
            // as started with one log line saying why nothing is happening yet.
            await gate.acquire(activityId, (running, ahead) =>
                logAgent(
                    activityId,
                    `waiting for a review slot: ${running} running, ${ahead} queued ahead (limit ${gate.limit})`,
                    "Admission",
                ),
            );
            admitted = true;
            // Cancelled while waiting: give the slot straight back rather than start.
            if (await activityService.isCanceled(activityId)) {
                throw new JobCanceledError();
            }
        }
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
    } finally {
        if (gate && admitted) gate.release();
    }
}
