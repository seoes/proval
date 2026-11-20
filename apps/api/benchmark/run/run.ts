import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { closeSync, existsSync, openSync, writeSync } from "node:fs";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { OUTPUT_DIR } from "../load/git.js";
import { loadManifest, MANIFEST_PATH } from "../load/manifest.js";
import type { AttemptRecord, Manifest, BenchmarkRunProfile, ResultLine, RunOptions } from "../types.js";
import {
    collectSourceState,
    hashFileContent,
    loadBenchmarkLlmConfig,
    loadProfile,
    machineDescription,
    safeUrl,
    PROFILE_PATH,
} from "../config.js";
import { cleanupAttempt } from "./clean.js";
import { reportBatch } from "../report/report.js";

/** Deterministic shuffle so every batch uses the same reproducible case order. */
export function seededShuffle<T>(itemList: T[], seed: number): T[] {
    const result = [...itemList];
    let state = seed >>> 0 || 1;
    const next = () => {
        state ^= state << 13;
        state ^= state >>> 17;
        state ^= state << 5;
        state >>>= 0;
        return state / 2 ** 32;
    };
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}

export function resolveCaseIdList(manifest: Manifest, runProfile: BenchmarkRunProfile): string[] {
    if (runProfile.caseIdList === null) {
        return manifest.caseList.map((entry) => entry.caseId);
    }
    return runProfile.caseIdList.map((caseId) => {
        if (!manifest.caseList.some((entry) => entry.caseId === caseId)) {
            throw new Error(`profile case ${caseId} is not in the manifest`);
        }
        return caseId;
    });
}

export async function readResultLineList(batchDir: string): Promise<ResultLine[]> {
    const path = join(batchDir, "result.jsonl");
    if (!existsSync(path)) return [];
    const content = await readFile(path, "utf-8");
    return content
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as ResultLine);
}

async function appendResultLine(batchDir: string, line: ResultLine): Promise<void> {
    await appendFile(join(batchDir, "result.jsonl"), `${JSON.stringify(line)}\n`);
}

/**
 * On resume, attempts that started but never wrote a terminal result are
 * classified as interrupted and stay in the report.
 */
export async function closeUnfinishedAttemptList(batchDir: string): Promise<number> {
    const lineList = await readResultLineList(batchDir);
    const finishedIdSet = new Set(lineList.filter((line) => line.type === "result").map((line) => line.runId));
    const unfinishedList = lineList.filter((line) => line.type === "start" && !finishedIdSet.has(line.runId));
    for (const line of unfinishedList) {
        await appendResultLine(batchDir, {
            ...line,
            type: "result",
            status: "interrupted",
            statusReason: "process-exited-before-terminal-record",
            finishedAt: new Date().toISOString(),
        });
    }
    return unfinishedList.length;
}

function attemptKey(caseId: string, repeatIndex: number): string {
    return `${caseId}#${repeatIndex}`;
}

let activeChild: { kill: (signal?: number | NodeJS.Signals) => void } | null = null;
/** Compact CI output. Child logs go to attempt/<runId>/full.log and error.log without color. */
const benchmarkMode = process.env.BENCHMARK_MODE !== "false";

export async function runBatch(option: RunOptions): Promise<void> {
    const manifest = await loadManifest();
    const profile = await loadProfile();
    const runProfile = profile[option.profileName];
    const llm = loadBenchmarkLlmConfig();
    let caseIdList = resolveCaseIdList(manifest, runProfile);
    if (option.caseIdList?.length) {
        for (const caseId of option.caseIdList) {
            if (!caseIdList.includes(caseId)) {
                throw new Error(`case ${caseId} is not part of the ${option.profileName} profile`);
            }
        }
        caseIdList = caseIdList.filter((caseId) => option.caseIdList!.includes(caseId));
    }
    const repeatCount = option.repeatCount ?? 1;
    if (!Number.isInteger(repeatCount) || repeatCount < 1) {
        throw new Error("--repeat must be a positive integer");
    }

    if (option.resume && !option.batchId) {
        throw new Error("--resume requires --batch <id>");
    }
    const batchId =
        option.batchId ??
        `${option.profileName}-${new Date()
            .toISOString()
            .replace(/[:.T-]/g, "")
            .slice(0, 14)}`;
    const batchDir = join(OUTPUT_DIR, batchId);
    await mkdir(join(batchDir, "tmp"), { recursive: true });

    const manifestHash = await hashFileContent(MANIFEST_PATH);
    const profileHash = await hashFileContent(PROFILE_PATH);
    const sourceState = await collectSourceState();
    const runIdentity = {
        profileName: option.profileName,
        repeatCount,
        seed: runProfile.seed,
        caseIdList,
        setting: profile.setting,
        manifestHash,
        profileHash,
        sourceStateHash: sourceState.sourceStateHash,
        bunVersion: Bun.version,
        modelName: llm.model,
        modelProvider: llm.provider,
        modelBaseUrl: safeUrl(llm.baseURL),
        machineDescription: machineDescription(),
    };

    if (option.resume) {
        const meta = JSON.parse(await readFile(join(batchDir, "run.json"), "utf-8")) as Record<string, unknown>;
        const mismatchList = Object.entries(runIdentity)
            .filter(([key, value]) => !isDeepStrictEqual(meta[key], value))
            .map(([key]) => key);
        if (mismatchList.length > 0) {
            throw new Error(
                `Cannot resume because ${mismatchList.join(", ")} changed or is missing. Start a new batch with the current configuration.`,
            );
        }
        const interruptedCount = await closeUnfinishedAttemptList(batchDir);
        if (interruptedCount > 0) {
            console.log(`classified ${interruptedCount} unfinished attempt(s) as interrupted`);
        }
    } else {
        if (existsSync(join(batchDir, "run.json"))) {
            throw new Error(`batch ${batchId} already exists, use --resume to continue it`);
        }
        await writeFile(
            join(batchDir, "run.json"),
            `${JSON.stringify(
                {
                    type: "batch",
                    batchId,
                    ...runIdentity,
                    caseInfoList: manifest.caseList
                        .filter((entry) => caseIdList.includes(entry.caseId))
                        .map(({ caseId, project, addedLineCount, deletedLineCount, changedFileCount }) => ({
                            caseId,
                            project,
                            addedLineCount,
                            deletedLineCount,
                            changedFileCount,
                        })),
                    startedAt: new Date().toISOString(),
                    provalCommit: sourceState.provalCommit,
                    isDirty: sourceState.isDirty,
                    datasetCommit: manifest.datasetCommit,
                },
                null,
                2,
            )}\n`,
        );
    }

    const existingLineList = await readResultLineList(batchDir);
    const doneKeySet = new Set(
        existingLineList
            .filter((line) => line.type === "result" && line.status === "completed")
            .map((line) => attemptKey(line.caseId, line.repeatIndex)),
    );
    const priorCountByKey = new Map<string, number>();
    for (const line of existingLineList) {
        if (line.type !== "result") continue;
        const key = attemptKey(line.caseId, line.repeatIndex);
        priorCountByKey.set(key, Math.max(priorCountByKey.get(key) ?? 0, line.attemptIndex));
    }

    let cancelRequested = false;
    const onSigint = () => {
        if (cancelRequested) {
            process.exit(130);
        }
        cancelRequested = true;
        console.log("cancel requested, stopping the active review...");
        activeChild?.kill("SIGTERM");
        setTimeout(() => activeChild?.kill("SIGKILL"), 10_000).unref();
    };
    process.on("SIGINT", onSigint);

    let planned = 0;
    let skipped = 0;
    const total = caseIdList.length * repeatCount;
    try {
        await reportBatch(batchId);
        for (let round = 1; round <= repeatCount; round++) {
            const orderedList = seededShuffle(caseIdList, runProfile.seed + round);
            for (const caseId of orderedList) {
                if (cancelRequested) break;
                const key = attemptKey(caseId, round);
                if (doneKeySet.has(key)) {
                    skipped++;
                    if (benchmarkMode) {
                        console.log(`[benchmark] ${planned + skipped}/${total} skip  ${caseId} r${round}`);
                    }
                    continue;
                }
                const attemptIndex = (priorCountByKey.get(key) ?? 0) + 1;
                const runId = `${caseId}__r${round}a${attemptIndex}__${randomUUID().slice(0, 8)}`;
                planned++;
                await appendResultLine(batchDir, {
                    type: "start",
                    runId,
                    caseId,
                    repeatIndex: round,
                    attemptIndex,
                    startedAt: new Date().toISOString(),
                });
                const progress = `${planned + skipped}/${total}`;
                console.log(
                    benchmarkMode
                        ? `[benchmark] ${progress} start ${caseId} r${round}a${attemptIndex}`
                        : `[run] ${caseId} repeat ${round} attempt ${attemptIndex} (${runId})`,
                );
                const attemptStartedAt = Date.now();

                const exitCode = await spawnAttempt(batchId, caseId, round, attemptIndex, runId);
                activeChild = null;

                const entry = manifest.caseList.find((candidate) => candidate.caseId === caseId)!;
                await cleanupAttempt(entry.repoUrl, runId, batchDir);

                const record = await readAttemptRecord(batchDir, runId);
                if (cancelRequested) {
                    await appendResultLine(batchDir, {
                        ...(record ?? {}),
                        type: "result",
                        runId,
                        caseId,
                        repeatIndex: round,
                        attemptIndex,
                        status: "canceled",
                        statusReason: "user-cancel",
                        finishedAt: new Date().toISOString(),
                    });
                    break;
                }
                if (record?.status && record.status !== "running") {
                    await appendResultLine(batchDir, { ...(record as ResultLine), type: "result" });
                } else {
                    await appendResultLine(batchDir, {
                        ...(record ?? {}),
                        type: "result",
                        runId,
                        caseId,
                        repeatIndex: round,
                        attemptIndex,
                        status: exitCode === 0 ? "interrupted" : "failed",
                        statusReason:
                            exitCode === 0 ? "process-exited-before-terminal-record" : `child-exit-code-${exitCode}`,
                        finishedAt: new Date().toISOString(),
                    });
                }
                priorCountByKey.set(key, attemptIndex);
                const lineList = await readResultLineList(batchDir);
                const last = [...lineList].reverse().find((line) => line.type === "result");
                if (benchmarkMode) {
                    const elapsedSec = Math.round((Date.now() - attemptStartedAt) / 1000);
                    const elapsed = `${String(Math.floor(elapsedSec / 60)).padStart(2, "0")}:${String(elapsedSec % 60).padStart(2, "0")}`;
                    const tokenUsage = last?.tokenUsage as AttemptRecord["tokenUsage"];
                    const tokens = tokenUsage
                        ? `input token ${tokenUsage.inputToken}, cached input token ${tokenUsage.cachedInputToken}, output token ${tokenUsage.outputToken}`
                        : "token none";
                    // Counts come from sub agent handoffs, before the writing agent filters them
                    const reviewPath = join(batchDir, "attempt", runId, "review.json");
                    const handoffList = existsSync(reviewPath)
                        ? (
                              (
                                  JSON.parse(await readFile(reviewPath, "utf-8")) as {
                                      subAgentList:
                                          | {
                                                handoff?: {
                                                    findingList: { severity: string }[];
                                                    goodPointList: unknown[];
                                                };
                                            }[]
                                          | null;
                                  }
                              ).subAgentList ?? []
                          ).flatMap((sub) => (sub.handoff ? [sub.handoff] : []))
                        : [];
                    const findingList = handoffList.flatMap((handoff) => handoff.findingList);
                    const goodPointCount = handoffList.reduce((sum, handoff) => sum + handoff.goodPointList.length, 0);
                    const problemCount = findingList.filter((finding) => finding.severity === "problem").length;
                    const criticalCount = findingList.filter((finding) => finding.severity === "critical").length;
                    const toolEntryList = Object.entries((last?.toolCallCountByName ?? {}) as Record<string, number>);
                    const tools =
                        toolEntryList.length === 0
                            ? "none"
                            : toolEntryList.map(([name, n]) => `${name}:${n}`).join(",");
                    const reason = last?.statusReason ? ` reason=${String(last.statusReason)}` : "";
                    console.log(
                        [
                            `[benchmark] ${progress} done  ${caseId} r${round}a${attemptIndex} ${last?.status ?? "unknown"}${reason} ${elapsed}`,
                            `            ${tokens}`,
                            `            good point ${goodPointCount}, problem ${problemCount}, critical ${criticalCount}`,
                            `            tools ${tools}`,
                        ].join("\n"),
                    );
                } else {
                    console.log(`[done] ${caseId} repeat ${round} -> ${last?.status ?? "unknown"}`);
                }
                await reportBatch(batchId);
            }
            if (cancelRequested) break;
        }
    } finally {
        process.off("SIGINT", onSigint);
        await reportBatch(batchId);
    }

    console.log(
        cancelRequested
            ? `batch ${batchId} canceled after ${planned} attempt(s)`
            : `batch ${batchId} finished: ${planned} attempt(s) run, ${skipped} skipped as completed`,
    );
    console.log(`Markdown report saved to ${join(batchDir, "report.md")}`);
}

async function spawnAttempt(
    batchId: string,
    caseId: string,
    repeatIndex: number,
    attemptIndex: number,
    runId: string,
): Promise<number> {
    const command = [
        process.execPath,
        resolve(import.meta.dir, "attempt.ts"),
        "--batch",
        batchId,
        "--case",
        caseId,
        "--repeat",
        String(repeatIndex),
        "--attempt",
        String(attemptIndex),
        "--run-id",
        runId,
    ];
    if (!benchmarkMode) {
        const proc = Bun.spawn(command, { stdout: "inherit", stderr: "inherit", env: process.env });
        activeChild = proc;
        return proc.exited;
    }

    const attemptDir = join(OUTPUT_DIR, batchId, "attempt", runId);
    await mkdir(attemptDir, { recursive: true });
    const fullFd = openSync(join(attemptDir, "full.log"), "a");
    const errorFd = openSync(join(attemptDir, "error.log"), "a");
    const proc = Bun.spawn(command, { stdout: fullFd, stderr: "pipe", env: { ...process.env, NO_COLOR: "1" } });
    activeChild = proc;
    // stderr goes to both files so full.log keeps errors in context
    for await (const chunk of proc.stderr) {
        writeSync(fullFd, chunk);
        writeSync(errorFd, chunk);
    }
    closeSync(fullFd);
    closeSync(errorFd);
    return proc.exited;
}

async function readAttemptRecord(batchDir: string, runId: string): Promise<Record<string, unknown> | null> {
    const path = join(batchDir, "attempt", runId, "run.json");
    if (!existsSync(path)) return null;
    try {
        return JSON.parse(await readFile(path, "utf-8")) as Record<string, unknown>;
    } catch {
        return null;
    }
}
