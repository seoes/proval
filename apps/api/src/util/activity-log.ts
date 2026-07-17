import type { ActivityLogEntry, ActivityLogLevel, ActivityLogStep } from "@proval/types";
import { ActivityService } from "../api/activity/activity.service.js";
import { log, logError } from "./log.js";

const activityService = new ActivityService();

export function activityLog(
    activityId: number,
    level: ActivityLogLevel,
    step: ActivityLogStep,
    message: string,
): void {
    if (level === "error") {
        logError(message, undefined, step);
    } else {
        log(message, step);
    }

    const entry: ActivityLogEntry = {
        timestamp: new Date().toISOString(),
        level,
        step,
        message,
    };
    void activityService.appendLog(activityId, entry);
}
