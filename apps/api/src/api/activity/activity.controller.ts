import type { Handler } from "hono";
import type { Activity } from "@proval/types";
import { parseDateOnlyEndExclusive, parseDateOnlyStart } from "../../util/date.js";
import { ActivityService, parseDashboardRange, resolveRange } from "./activity.service.js";

function parsePositiveInt(value: string | undefined, fallback: number): number {
    const parsed = parseInt(value ?? String(fallback), 10);
    if (!Number.isFinite(parsed) || parsed < 1) return fallback;
    return parsed;
}

const ACTIVITY_STATUS_LIST = ["started", "completed", "failed", "canceled"] as const;
const ACTIVITY_TYPE_LIST = ["pr_review", "pr_reply", "issue_open", "issue_reply"] as const;

function parseCommaSeparatedEnum<T extends string>(value: string | undefined, allowedList: readonly T[]): T[] {
    if (!value?.trim()) return [];
    const allowed = new Set<string>(allowedList);
    const seen = new Set<T>();
    const result: T[] = [];
    for (const part of value.split(",")) {
        const trimmed = part.trim();
        if (!trimmed || !allowed.has(trimmed)) continue;
        const item = trimmed as T;
        if (seen.has(item)) continue;
        seen.add(item);
        result.push(item);
    }
    return result;
}

function parseCommaSeparatedPositiveIntList(value: string | undefined): number[] {
    if (!value?.trim()) return [];
    const seen = new Set<number>();
    const result: number[] = [];
    for (const part of value.split(",")) {
        const trimmed = part.trim();
        if (!trimmed) continue;
        const parsed = parseInt(trimmed, 10);
        if (!Number.isFinite(parsed) || parsed < 1) continue;
        if (seen.has(parsed)) continue;
        seen.add(parsed);
        result.push(parsed);
    }
    return result;
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
    const statusList = parseCommaSeparatedEnum<Activity["status"]>(c.req.query("status"), ACTIVITY_STATUS_LIST);
    const typeList = parseCommaSeparatedEnum<Activity["type"]>(c.req.query("type"), ACTIVITY_TYPE_LIST);
    const repositoryIdList = parseCommaSeparatedPositiveIntList(c.req.query("repository"));
    const from = parseDateOnlyStart(c.req.query("from"));
    const to = parseDateOnlyEndExclusive(c.req.query("to"));
    const activityService = new ActivityService();
    const result = await activityService.findAll({
        page,
        limit,
        statusList: statusList.length ? statusList : undefined,
        typeList: typeList.length ? typeList : undefined,
        repositoryIdList: repositoryIdList.length ? repositoryIdList : undefined,
        from,
        to,
    });
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

const RETRY_NOT_FOUND_ERRORS = new Set(["Activity not found", "Repository not found", "Model provider not found"]);

const RETRY_CLIENT_ERRORS = new Set([
    "Only failed or canceled activities can be retried",
    "This activity type cannot be retried",
    "Repository is no longer linked to this activity",
    "Model provider is no longer linked to this activity",
]);

const CANCEL_NOT_FOUND_ERRORS = new Set(["Activity not found"]);

const CANCEL_CLIENT_ERRORS = new Set(["Only started activities can be canceled"]);

export const retryActivity: Handler = async (c) => {
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
        await activityService.retry(activityId);
        return c.json({ message: "Retry started" }, 202);
    } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to retry activity";
        if (RETRY_NOT_FOUND_ERRORS.has(message)) {
            return c.json({ error: message }, 404);
        }
        if (RETRY_CLIENT_ERRORS.has(message)) {
            return c.json({ error: message }, 400);
        }
        return c.json({ error: message }, 500);
    }
};

export const cancelActivity: Handler = async (c) => {
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
        await activityService.cancel(activityId);
        return c.json({ message: "Cancel requested" }, 202);
    } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to cancel activity";
        if (CANCEL_NOT_FOUND_ERRORS.has(message)) {
            return c.json({ error: message }, 404);
        }
        if (CANCEL_CLIENT_ERRORS.has(message)) {
            return c.json({ error: message }, 400);
        }
        return c.json({ error: message }, 500);
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
