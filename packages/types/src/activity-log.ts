import type { Activity } from "./database.js";

export type ActivityLogLevel = "info" | "warn" | "error" | "debug";

export type ActivityLogStep = "lifecycle" | "context" | "workspace" | "agent";

export type ActivityLogEntry = {
    timestamp: string;
    level: ActivityLogLevel;
    step: ActivityLogStep;
    message: string;
};

export type ActivityLogResponse = {
    status: Activity["status"];
    logs: ActivityLogEntry[];
};

/** Activity row as returned by list/detail APIs (logs loaded separately). */
export type ActivityResponse = Omit<Activity, "logs">;
