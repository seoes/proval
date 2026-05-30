import type { Handler } from "hono";
import { ActivityService } from "./activity.service.js";

function parsePositiveInt(value: string | undefined, fallback: number): number {
    const parsed = parseInt(value ?? String(fallback), 10);
    if (!Number.isFinite(parsed) || parsed < 1) return fallback;
    return parsed;
}

export const getActivitySummary: Handler = async (c) => {
    const activityService = new ActivityService();
    const [last24Hours, inProgress] = await Promise.all([
        activityService.getLast24HoursStats(),
        activityService.findInProgress(10),
    ]);
    return c.json({ last24Hours, inProgress }, 200);
};

export const findAllActivity: Handler = async (c) => {
    const page = parsePositiveInt(c.req.query("page"), 1);
    const limit = parsePositiveInt(c.req.query("limit"), 10);
    const activityService = new ActivityService();
    const result = await activityService.findAll({ page, limit });
    return c.json(result, 200);
};

export const findActivityById: Handler = async (c) => {
    const id = c.req.param("id");
    if (!id) {
        return c.json({ error: "Activity ID is required" }, 400);
    }
    const activityId = parseInt(id, 10);
    if (!Number.isFinite(activityId)) {
        return c.json({ error: "Invalid activity ID" }, 400);
    }
    const activityService = new ActivityService();
    const activity = await activityService.findById(activityId);
    return c.json(activity, 200);
};
