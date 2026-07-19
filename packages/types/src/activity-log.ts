import type { Activity } from "./database.js";

export type ActivityLogLevel = "info" | "warn" | "error" | "debug";

export type ActivityLogEntry = {
    timestamp: string;
    level: ActivityLogLevel;
    label: string;
    message: string;
};

export type ActivityLogResponse = {
    status: Activity["status"];
    logs: ActivityLogEntry[];
};

/** Activity row as returned by list/detail APIs (logs loaded separately). */
export type ActivityResponse = Omit<Activity, "logs">;
