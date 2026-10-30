/* eslint-disable no-console */

import pc from "picocolors";
import type {
    ActivityLogEntry,
    CommonLogEntry,
    ToolCallLogEntry,
    ToolResultLogEntry,
    ToolErrorLogEntry,
} from "@proval/types";
import type { AgentRunResult } from "../agent/llm/loop.js";
import { ActivityService } from "../api/activity/activity.service.js";

const timestamp = () => pc.dim(`[${new Date().toISOString()}]`);

const formatLabel = (label: string) => `${pc.cyan(pc.bold(label))}${pc.dim(" · ")}`;

/** Terminal stays short for live scrolling. */
const TERMINAL_LOG_MAX = 120;
/** Tool call and result lines. Longer so args stay readable, still capped. */
const TERMINAL_TOOL_LOG_MAX = 800;
/** Tool errors need the provider message. Keep close to full text. */
const TERMINAL_ERROR_LOG_MAX = 2000;
/** Dashboard keeps more context for postmortem. */
const DASHBOARD_LOG_MAX = 32000;

const activityService = new ActivityService();

function shortenLogMessage(message: string, max: number): string {
    return message.length > max ? `${message.slice(0, max)}…` : message;
}

type AgentLogInput =
    | Omit<CommonLogEntry, "timestamp">
    | Omit<ToolCallLogEntry, "timestamp">
    | Omit<ToolResultLogEntry, "timestamp">
    | Omit<ToolErrorLogEntry, "timestamp">;

function persistAgentLog(activityId: number, input: AgentLogInput): void {
    const entry: ActivityLogEntry = {
        ...input,
        timestamp: new Date().toISOString(),
        message: shortenLogMessage(input.message, DASHBOARD_LOG_MAX),
    };
    void activityService.appendLog(activityId, entry);
}

export const log = (message: string, label?: string) => {
    const prefix = label ? formatLabel(label) : "";
    console.log(`${prefix}${message}`);
};

export const logError = (message: string, error?: unknown, label?: string): void => {
    const prefix = label ? formatLabel(label) : "";
    console.error(`${timestamp()} ${pc.red(pc.bold("ERROR"))} ${prefix}${pc.red(message)}`);
    if (!error) return;

    if (error instanceof Error) {
        console.error(`  ${pc.red(error.message)}`);
        if (error.stack) {
            for (const line of error.stack.split("\n").slice(1)) {
                console.error(`  ${pc.dim(line)}`);
            }
        }
        return;
    }

    console.error(`  ${pc.red(String(error))}`);
};

export const debug = (message: string, label?: string) => {
    if (process.env.NODE_ENV === "production") return;

    const prefix = label ? formatLabel(label) : "";
    console.debug(`${timestamp()} ${pc.green(pc.bold("DEBUG"))} ${prefix}${pc.dim(message)}`);
};

export function logAgent(activityId: number, message: string, label: string): void {
    log(shortenLogMessage(message, TERMINAL_LOG_MAX), label);
    persistAgentLog(activityId, { type: "common", level: "info", label, message });
}

function logToolLine(label: string, heading: string, body: string): void {
    const prefix = formatLabel(label);
    const trimmed = shortenLogMessage(body, TERMINAL_TOOL_LOG_MAX);
    const lineList = trimmed.length === 0 ? [""] : trimmed.split("\n");
    const first = lineList[0] ?? "";
    const firstText = first.length > 0 ? `${heading} ${pc.dim(first)}` : heading;
    console.log(`${prefix}${firstText}`);
    for (const line of lineList.slice(1)) {
        console.log(`${prefix}${pc.dim(line)}`);
    }
}

export function logAgentTool(
    activityId: number,
    entry:
        | Omit<ToolCallLogEntry, "timestamp" | "level">
        | Omit<ToolResultLogEntry, "timestamp" | "level">
        | Omit<ToolErrorLogEntry, "timestamp" | "level">,
    error?: unknown,
): void {
    if (entry.type === "tool-error") {
        logError(shortenLogMessage(`${entry.toolName} ${entry.message}`, TERMINAL_ERROR_LOG_MAX), error, entry.label);
        persistAgentLog(activityId, { ...entry, type: entry.type, level: "error" });
        return;
    }

    const heading = entry.type === "tool-call" ? `  → ${entry.toolName}` : `result ${entry.toolName}`;
    logToolLine(entry.label, heading, entry.message);
    persistAgentLog(activityId, { ...entry, type: entry.type, level: "info" });
}

export function logAgentError(activityId: number, message: string, error?: unknown, label?: string): void {
    let storedMessage = message;
    if (error instanceof Error) {
        const errorMessage = error.message.trim();
        if (errorMessage && !message.includes(errorMessage)) {
            storedMessage = `${message}: ${errorMessage}`;
        }
    }
    logError(shortenLogMessage(message, TERMINAL_ERROR_LOG_MAX), error, label);
    persistAgentLog(activityId, { type: "common", level: "error", label: label ?? "log", message: storedMessage });
}

function formatAgentResultMessage(
    result: AgentRunResult,
    elapsedMs: number,
    reason: "completed" | "max_steps",
): string {
    const secs = (elapsedMs / 1000).toFixed(1);
    const status = reason === "completed" ? "completed" : "max steps";
    const toolEntryList = Object.entries(result.toolCallCount);
    const tools = toolEntryList.length === 0 ? "none" : toolEntryList.map(([name, n]) => `${name}×${n}`).join(", ");
    return `${status} in ${secs}s · ${result.stepCount} steps · tools: ${tools} · in=${result.usage.inputToken} out=${result.usage.outputToken}`;
}

export const logAgentResult = (
    activityId: number,
    label: string,
    result: AgentRunResult,
    elapsedMs: number,
    reason: "completed" | "max_steps",
): void => {
    const message = formatAgentResultMessage(result, elapsedMs, reason);
    log(message, label);
    persistAgentLog(activityId, { type: "common", level: reason === "completed" ? "info" : "warn", label, message });
};
