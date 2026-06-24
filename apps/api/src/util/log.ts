/* eslint-disable no-console */

import pc from "picocolors";
import type { AgentRunResult } from "../agent/llm/loop.js";

const timestamp = () => pc.dim(`[${new Date().toISOString()}]`);

const formatLabel = (label: string) => `${pc.cyan(pc.bold(label))}${pc.dim(" · ")}`;

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
    console.debug(`${timestamp()} ${pc.magenta(pc.bold("DEBUG"))} ${prefix}${pc.dim(message)}`);
};

export const logAgentResult = (
    label: string,
    result: AgentRunResult,
    elapsedMs: number,
    reason: "completed" | "max_steps",
): void => {
    const secs = (elapsedMs / 1000).toFixed(1);
    const status = reason === "completed" ? pc.green("completed") : pc.yellow("max steps");
    const toolEntryList = Object.entries(result.toolCallCount);
    const tools =
        toolEntryList.length === 0
            ? pc.dim("none")
            : toolEntryList.map(([name, n]) => `${pc.yellow(name)}${pc.dim("×")}${n}`).join(pc.dim(", "));

    const parts = [
        status,
        pc.dim("in"),
        pc.green(`${secs}s`),
        pc.dim("·"),
        `${pc.bold(String(result.stepCount))} steps`,
        pc.dim("·"),
        `tools: ${tools}`,
        pc.dim("·"),
        `input tokens: ${result.usage.inputToken}`,
        pc.dim("·"),
        `cached input tokens: ${result.usage.cachedInputToken}`,
        pc.dim("·"),
        `output tokens: ${result.usage.outputToken}`,
    ];

    if (result.finalMessage) {
        const preview = result.finalMessage.length > 80 ? `${result.finalMessage.slice(0, 80)}…` : result.finalMessage;
        parts.push(pc.dim("·"), `message: ${pc.dim(preview)}`);
    }

    log(parts.join(" "), label);
};
