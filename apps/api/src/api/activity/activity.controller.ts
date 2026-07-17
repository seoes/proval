import type { Handler } from "hono";
import { ActivityService, parseDashboardRange, resolveRange } from "./activity.service.js";

function parsePositiveInt(value: string | undefined, fallback: number): number {
    const parsed = parseInt(value ?? String(fallback), 10);
    if (!Number.isFinite(parsed) || parsed < 1) return fallback;
    return parsed;
}

export const getActivitySummary: Handler = async (c) => {
    const range = parseDashboardRange(c.req.query("range"));
    const { since, bucket } = resolveRange(range);
    const activityService = new ActivityService();
    const [stats, recent, tokenSeries, tokensByModel, tokensByRepository, inProgress] = await Promise.all([
        activityService.getStats(since),
        activityService.findRecent(since, 5),
        activityService.getTokenSeries(since, bucket),
        activityService.getTokenBreakdownByModel(since, 5),
        activityService.getTokenBreakdownByRepository(since, 5),
        activityService.findInProgress(10),
    ]);
    return c.json({ range, stats, recent, tokenSeries, tokensByModel, tokensByRepository, inProgress }, 200);
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
    try {
        const activity = await activityService.findById(activityId);
        if (activity === null) {
            return c.json({ error: "Activity not found" }, 404);
        }
        return c.json(activity, 200);
    } catch {
        return c.json({ error: "Failed to load activity" }, 500);
    }
};

export const findActivityLogById: Handler = async (c) => {
    const id = c.req.param("id");
    if (!id) {
        return c.json({ error: "Activity ID is required" }, 400);
    }
    const activityId = parseInt(id, 10);
    if (!Number.isFinite(activityId)) {
        return c.json({ error: "Invalid activity ID" }, 400);
    }
    const activityService = new ActivityService();
    try {
        const logList = await activityService.findLogListById(activityId);
        if (logList === null) {
            return c.json({ error: "Activity not found" }, 404);
        }
        return c.json(logList, 200);
    } catch {
        return c.json({ error: "Failed to load activity logs" }, 500);
    }
};
