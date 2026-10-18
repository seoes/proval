import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { OUTPUT_DIR } from "./git.js";
import { loadManifest, MANIFEST_PATH } from "./load.js";
import type { Manifest, BenchmarkRunProfile } from "./types.js";
import {
    collectSourceState,
    hashFileContent,
    loadBenchmarkLlmConfig,
    loadProfile,
    machineDescription,
    safeUrl,
    PROFILE_PATH,
} from "./util.js";
import type { AttemptStatus } from "./measure.js";
import { cleanupAttempt } from "./clean.js";
import { reportBatch } from "./report.js";

export type ResultLine = {
    type: "start" | "result";
    runId: string;
    caseId: string;
    repeatIndex: number;
    attemptIndex: number;
    status?: AttemptStatus;
    [key: string]: unknown;
};

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
        [result[i], result[j]] = [result[j]!, result[i]!];
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

export type RunOptions = {
    profileName: "quick" | "full";
    batchId?: string;
    resume: boolean;
    /** Restrict the batch to a subset of profile cases. */
    caseIdList?: string[];
};

let activeChild: { kill: (signal?: number | NodeJS.Signals) => void } | null = null;

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
        repeatCount: runProfile.repeatCount,
        seed: runProfile.seed,
        caseIdList,
        setting: profile.setting,
        manifestHash,
        profileHash,
        sourceStateHash: sourceState.sourceStateHash,
        bunVersion: Bun.version,
        modelName: llm.model,
        modelProvider: llm.provider,
        modelBaseUrl: safeUrl(llm.baseUrl),
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
    try {
        await reportBatch(batchId);
        for (let round = 1; round <= runProfile.repeatCount; round++) {
            const orderedList = seededShuffle(caseIdList, runProfile.seed + round);
            for (const caseId of orderedList) {
                if (cancelRequested) break;
                const key = attemptKey(caseId, round);
                if (doneKeySet.has(key)) {
                    skipped++;
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
                console.log(`[run] ${caseId} repeat ${round} attempt ${attemptIndex} (${runId})`);

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
                console.log(`[done] ${caseId} repeat ${round} -> ${last?.status ?? "unknown"}`);
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

function spawnAttempt(
    batchId: string,
    caseId: string,
    repeatIndex: number,
    attemptIndex: number,
    runId: string,
): Promise<number> {
    const proc = Bun.spawn(
        [
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
        ],
        { stdout: "inherit", stderr: "inherit", env: process.env },
    );
    activeChild = proc;
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
