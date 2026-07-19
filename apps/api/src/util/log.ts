/* eslint-disable no-console */

import pc from "picocolors";
import type { ActivityLogEntry, ActivityLogLevel } from "@proval/types";
import type { AgentRunResult } from "../agent/llm/loop.js";
import { ActivityService } from "../api/activity/activity.service.js";

const timestamp = () => pc.dim(`[${new Date().toISOString()}]`);

const formatLabel = (label: string) => `${pc.cyan(pc.bold(label))}${pc.dim(" · ")}`;

/** Terminal stays short for live scrolling. */
const TERMINAL_LOG_MAX = 120;
/** Dashboard keeps more context for postmortem. */
const DASHBOARD_LOG_MAX = 1000;

const activityService = new ActivityService();

function shortenLogMessage(message: string, max: number): string {
    return message.length > max ? `${message.slice(0, max)}…` : message;
}

function persistAgentLog(activityId: number, level: ActivityLogLevel, label: string, message: string): void {
    const entry: ActivityLogEntry = {
        timestamp: new Date().toISOString(),
        level,
        label,
        message: shortenLogMessage(message, DASHBOARD_LOG_MAX),
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
    persistAgentLog(activityId, "info", label, message);
}

export function logAgentError(activityId: number, message: string, error?: unknown, label?: string): void {
    logError(shortenLogMessage(message, TERMINAL_LOG_MAX), error, label);
    persistAgentLog(activityId, "error", label ?? "log", message);
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
    persistAgentLog(activityId, reason === "completed" ? "info" : "warn", label, message);
};
