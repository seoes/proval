/* eslint-disable no-console */

import pc from "picocolors";

const WIDTH = 72;

export function logStep(step: string, message: string): void {
    console.log(`${pc.cyan(pc.bold(`[${step}]`))} ${message}`);
}

export function logInfo(message: string): void {
    console.log(`${pc.dim("  ")}${pc.dim(message)}`);
}

export function logSection(title: string): void {
    console.log("");
    console.log(pc.dim("=".repeat(WIDTH)));
    console.log(pc.bold(title));
    console.log(pc.dim("=".repeat(WIDTH)));
}

export function logSubSection(title: string): void {
    console.log("");
    console.log(pc.dim("-".repeat(WIDTH)));
    console.log(pc.yellow(pc.bold(title)));
    console.log(pc.dim("-".repeat(WIDTH)));
}

export function logBlock(label: string, body: string): void {
    logSubSection(label);
    console.log(body.trimEnd() || "(empty)");
    console.log("");
}

export function logError(message: string, error?: unknown): void {
    console.error(`${pc.red(pc.bold("[error]"))} ${pc.red(message)}`);
    if (error instanceof Error) {
        console.error(pc.red(error.message));
        if (error.stack) {
            for (const line of error.stack.split("\n").slice(1)) {
                console.error(pc.dim(line));
            }
        }
        return;
    }
    if (error !== undefined) {
        console.error(pc.red(String(error)));
    }
}
