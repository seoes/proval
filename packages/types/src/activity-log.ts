import type { Activity } from "./database.js";

export type ActivityLogLevel = "info" | "warn" | "error" | "debug";

export type ActivityLogType = "common" | "tool-call" | "tool-result" | "tool-error";

interface ActivityLogBase<T extends ActivityLogType> {
    type: T;
    timestamp: string;
    level: ActivityLogLevel;
    label: string;
    message: string;
}

export type CommonLogEntry = ActivityLogBase<"common">;

export interface ToolCallLogEntry extends ActivityLogBase<"tool-call"> {
    toolName: string;
    toolCallId: string;
}

export interface ToolResultLogEntry extends ActivityLogBase<"tool-result"> {
    toolName: string;
    toolCallId: string;
}

export interface ToolErrorLogEntry extends ActivityLogBase<"tool-error"> {
    level: "error";
    toolName: string;
    toolCallId: string;
}

export type ActivityLogEntry = CommonLogEntry | ToolCallLogEntry | ToolResultLogEntry | ToolErrorLogEntry;

export type ActivityLogResponse = {
    status: Activity["status"];
    logVersion: "1";
    /** Present when the caller asked for a tail. Entries before this index are omitted. */
    from?: number;
    logs: ActivityLogEntry[];
};

/** Fields that change while a review is running. The detail poll reads only these. */
export type ActivityStatusResponse = Pick<
    Activity,
    "status" | "completedAt" | "errorMessage" | "inputToken" | "cachedInputToken" | "outputToken"
>;

/** Activity row as returned by list/detail APIs (logs loaded separately). */
export type ActivityResponse = Omit<Activity, "logs">;
