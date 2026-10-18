import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { computeDiffStat, git } from "./git.js";
import { MANIFEST_SCHEMA_VERSION } from "./load.js";
import { closeUnfinishedAttemptList, readResultLineList, seededShuffle } from "./run.js";
import type { Manifest, PhaseTiming, SenderStat } from "./types.js";

describe("seededShuffle", () => {
    test("is deterministic for the same seed and differs across seeds", () => {
        const itemList = ["a", "b", "c", "d", "e", "f", "g", "h"];
        const first = seededShuffle(itemList, 43);
        const second = seededShuffle(itemList, 43);
        const other = seededShuffle(itemList, 44);
        expect(first).toEqual(second);
        expect(first).not.toEqual(other);
        expect([...first].sort()).toEqual([...itemList].sort());
        // Input order must not be mutated.
        expect(itemList).toEqual(["a", "b", "c", "d", "e", "f", "g", "h"]);
    });
});

describe("closeUnfinishedAttemptList", () => {
    test("classifies attempts without a terminal record as interrupted", async () => {
        const dir = await mkdtemp(join(tmpdir(), "proval-bench-run-"));
        try {
            const lineList = [
                { type: "start", runId: "r1", caseId: "case__1", repeatIndex: 1, attemptIndex: 1 },
                {
                    type: "result",
                    runId: "r1",
                    caseId: "case__1",
                    repeatIndex: 1,
                    attemptIndex: 1,
                    status: "completed",
                },
                { type: "start", runId: "r2", caseId: "case__2", repeatIndex: 1, attemptIndex: 1 },
            ];
            await writeFile(join(dir, "result.jsonl"), lineList.map((line) => JSON.stringify(line)).join("\n") + "\n");

            const count = await closeUnfinishedAttemptList(dir);
            expect(count).toBe(1);

            const after = await readResultLineList(dir);
            const interrupted = after.filter((line) => line.type === "result" && line.status === "interrupted");
            expect(interrupted.length).toBe(1);
            expect(interrupted[0]!.runId).toBe("r2");
            expect(interrupted[0]!.statusReason).toBe("process-exited-before-terminal-record");

            // A second pass must not duplicate the classification.
            expect(await closeUnfinishedAttemptList(dir)).toBe(0);

            // result.jsonl stays append only and parseable.
            const raw = await readFile(join(dir, "result.jsonl"), "utf-8");
            expect(raw.trim().split("\n").length).toBe(4);
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    });
});

let rootDir: string;
let repoDir: string;
let dataDir: string;
let manifestPath: string;
let profilePath: string;
let headSha: string;

async function writeFixtureRepo(): Promise<void> {
    repoDir = join(rootDir, "fixture-repo");
    await mkdir(join(repoDir, "src"), { recursive: true });
    await git(["init", "-b", "main", "."], repoDir);
    await git(["config", "user.email", "bench@example.com"], repoDir);
    await git(["config", "user.name", "bench"], repoDir);
    await git(["config", "commit.gpgsign", "false"], repoDir);
    await writeFile(join(repoDir, "src", "old.ts"), "export const a = 1;\n");
    await writeFile(join(repoDir, "src", "b.ts"), "export const b = 1;\n");
    await git(["add", "."], repoDir);
    await git(["commit", "-m", "base"], repoDir);
    const baseSha = await git(["rev-parse", "HEAD"], repoDir);
    await git(["mv", "src/old.ts", "src/a.ts"], repoDir);
    await writeFile(join(repoDir, "src", "b.ts"), "export const b = 2;\n");
    await git(["add", "."], repoDir);
    await git(["commit", "-m", "head"], repoDir);
    headSha = await git(["rev-parse", "HEAD"], repoDir);

    const stat = await computeDiffStat(repoDir, baseSha, headSha);
    const manifest: Manifest = {
        schemaVersion: MANIFEST_SCHEMA_VERSION,
        datasetCommit: headSha,
        importedAt: new Date().toISOString(),
        caseList: [
            {
                caseId: "fixture__1",
                project: "fixture",
                sourceUrl: "https://example.com/fixture/pull/1",
                repoUrl: repoDir.replaceAll("\\", "/"),
                prNumber: 1,
                title: "fixture pr",
                body: "",
                baseSha,
                startSha: baseSha,
                headSha,
                ...stat,
            },
        ],
        unavailableList: [],
    };
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2));

    const profile = {
        schemaVersion: 1,
        setting: {
            language: "English",
            inlineReview: true,
            userPrompt: "",
            reasoningEffort: null,
            llmConcurrency: null,
            timeoutSecond: 600,
        },
        quick: { repeatCount: 1, seed: 42, caseIdList: ["fixture__1"] },
        full: { repeatCount: 1, seed: 42, caseIdList: null },
    };
    await writeFile(profilePath, JSON.stringify(profile, null, 2));
}

async function writeChangedManifest(name: string, change: () => Promise<void>): Promise<string> {
    await git(["checkout", "--detach", headSha], repoDir);
    await change();
    await git(["add", "."], repoDir);
    await git(["commit", "-m", name], repoDir);
    const nextHeadSha = await git(["rev-parse", "HEAD"], repoDir);
    await git(["update-ref", `refs/heads/${name}`, nextHeadSha], repoDir);
    const stat = await computeDiffStat(repoDir, headSha, nextHeadSha);
    const manifest = JSON.parse(await readFile(manifestPath, "utf-8")) as Manifest;
    Object.assign(manifest.caseList[0]!, { baseSha: headSha, startSha: headSha, headSha: nextHeadSha, ...stat });
    const path = join(rootDir, `${name}.json`);
    await writeFile(path, JSON.stringify(manifest));
    await git(["checkout", "--detach", headSha], repoDir);
    return path;
}

function childEnv(extra: Record<string, string> = {}): Record<string, string> {
    return {
        ...process.env,
        BENCHMARK_DATA_DIR: dataDir,
        BENCHMARK_MANIFEST_PATH: manifestPath,
        BENCHMARK_PROFILE_PATH: profilePath,
        LLM_BASE_URL: "http://localhost:1",
        LLM_API_KEY: "fake",
        LLM_MODEL: "fake-model",
        ...extra,
    } as Record<string, string>;
}

function spawnWorkerChild(env: Record<string, string>, attemptIndex: number, tag: string) {
    return Bun.spawn(
        [
            process.execPath,
            resolve(import.meta.dir, "attempt.ts"),
            "--batch",
            "test-batch",
            "--case",
            "fixture__1",
            "--repeat",
            "1",
            "--attempt",
            String(attemptIndex),
            "--run-id",
            `fixture__1__r1a${attemptIndex}__${tag}`,
        ],
        { stdout: "pipe", stderr: "pipe", env },
    );
}

async function runWorkerChild(
    env: Record<string, string>,
    attemptIndex: number,
    tag: string,
): Promise<{ exitCode: number; stdout: string; stderr: string; record: WorkerRunRecord }> {
    const proc = spawnWorkerChild(env, attemptIndex, tag);
    const [stdout, stderr, exitCode] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
    ]);
    const record = await readRunJson(`fixture__1__r1a${attemptIndex}__${tag}`);
    return { exitCode, stdout, stderr, record };
}

type WorkerRunRecord = {
    status: string;
    statusReason: string | null;
    phase: string;
    error: string | null;
    coverageMissList: string[];
    postedCommentCount: number;
    evaluation: string | null;
    reviewUnitCount: number;
    timing: PhaseTiming;
    subAgentList: { durationMs: number }[];
    sender: SenderStat;
    tokenUsage: { inputToken: number; outputToken: number; cachedInputToken: number };
    loopStepCount: number;
};

async function readRunJson(runId: string): Promise<WorkerRunRecord> {
    const path = join(dataDir, "output", "test-batch", "attempt", runId, "run.json");
    return JSON.parse(await readFile(path, "utf-8")) as WorkerRunRecord;
}

beforeAll(async () => {
    rootDir = await mkdtemp(join(tmpdir(), "proval-bench-"));
    dataDir = join(rootDir, "data");
    manifestPath = join(rootDir, "manifest.json");
    profilePath = join(rootDir, "profile.json");
    await writeFixtureRepo();
});

afterAll(async () => {
    await rm(rootDir, { recursive: true, force: true });
});

describe("batch resume with fake sender", () => {
    test("only resumes the original execution condition and preserves output on rejection", async () => {
        const batchManifest = JSON.parse(await readFile(manifestPath, "utf-8")) as Manifest;
        batchManifest.caseList.push({
            ...batchManifest.caseList[0]!,
            caseId: "fixture__2",
            sourceUrl: "https://example.com/fixture/pull/2",
            prNumber: 2,
        });
        const batchManifestPath = join(rootDir, "resume-manifest.json");
        await writeFile(batchManifestPath, JSON.stringify(batchManifest));
        const batchProfile = JSON.parse(await readFile(profilePath, "utf-8"));
        batchProfile.quick.caseIdList = ["fixture__1", "fixture__2"];
        const batchProfilePath = join(rootDir, "resume-profile.json");
        await writeFile(batchProfilePath, JSON.stringify(batchProfile));
        const env = childEnv({
            BENCHMARK_FAKE_SENDER: "scripted",
            BENCHMARK_MANIFEST_PATH: batchManifestPath,
            BENCHMARK_PROFILE_PATH: batchProfilePath,
            LLM_PROVIDER: "openai",
            LLM_BASE_URL: "http://first:secret@localhost:1",
        });
        const run = async (argList: string[], extra: Record<string, string> = {}) => {
            const proc = Bun.spawn(
                [process.execPath, resolve(import.meta.dir, "index.ts"), "run", ...argList, "--batch", "resume-batch"],
                { stdout: "pipe", stderr: "pipe", env: { ...env, ...extra } },
            );
            const [stdout, stderr, exitCode] = await Promise.all([
                new Response(proc.stdout).text(),
                new Response(proc.stderr).text(),
                proc.exited,
            ]);
            return { stdout, stderr, exitCode };
        };
        expect((await run(["quick", "--case", "fixture__1"])).exitCode).toBe(0);
        const batchDir = join(dataDir, "output", "resume-batch");
        const resultPath = join(batchDir, "result.jsonl");
        const metaPath = join(batchDir, "run.json");
        const originalResult = await readFile(resultPath, "utf-8");
        expect(JSON.parse(originalResult.trim().split("\n").at(-1)!).status).toBe("completed");
        const originalMeta = await readFile(metaPath, "utf-8");
        expect(JSON.parse(originalMeta).caseInfoList).toEqual([
            { caseId: "fixture__1", project: "fixture", addedLineCount: 1, deletedLineCount: 1, changedFileCount: 2 },
        ]);
        const markdown = await readFile(join(batchDir, "report.md"), "utf-8");
        expect(markdown).toContain("# Proval benchmark");
        expect(markdown).toContain("| fixture\\_\\_1 | S | 2 | 2 | Completed 1 |");
        expect(markdown).toContain("| 1 | 1 | 1 | 0 |");
        expect(markdown).not.toContain("{{");
        const resumeArgList = ["quick", "--case", "fixture__1", "--resume"];
        const resumed = await run(resumeArgList, {
            LLM_API_KEY: "rotated",
            LLM_BASE_URL: "http://second:rotated@localhost:1",
        });
        expect(resumed.exitCode).toBe(0);
        expect(resumed.stdout).toContain("0 attempt(s) run, 1 skipped as completed");
        expect(await readFile(resultPath, "utf-8")).toBe(originalResult);
        expect(await readFile(metaPath, "utf-8")).toBe(originalMeta);

        // Rejection must happen before classifying an unfinished attempt.
        const pendingResult =
            originalResult +
            JSON.stringify({
                type: "start",
                runId: "pending",
                caseId: "fixture__2",
                repeatIndex: 1,
                attemptIndex: 1,
            }) +
            "\n";
        await writeFile(resultPath, pendingResult);
        for (const [field, extra] of [
            ["modelName", { LLM_MODEL: "other-model" }],
            ["modelProvider", { LLM_PROVIDER: "anthropic" }],
            ["modelBaseUrl", { LLM_BASE_URL: "http://localhost:2" }],
        ] as const) {
            const rejected = await run(resumeArgList, extra);
            expect(rejected.exitCode).toBe(1);
            expect(rejected.stderr).toContain(field);
            expect(await readFile(resultPath, "utf-8")).toBe(pendingResult);
        }
        for (const [field, argList] of [
            ["profileName", ["full", "--case", "fixture__1", "--resume"]],
            ["caseIdList", ["quick", "--resume"]],
        ] as const) {
            const rejected = await run([...argList]);
            expect(rejected.exitCode).toBe(1);
            expect(rejected.stderr).toContain(field);
            expect(await readFile(resultPath, "utf-8")).toBe(pendingResult);
        }
        const meta = JSON.parse(originalMeta);
        for (const [field, value] of [
            ["sourceStateHash", "previous-source"],
            ["repeatCount", 3],
            ["seed", 7],
            ["setting", { ...meta.setting, llmConcurrency: 1 }],
            ["manifestHash", "previous-manifest"],
            ["profileHash", "previous-profile"],
            ["bunVersion", "previous-runtime"],
            ["machineDescription", "previous-machine"],
            ["sourceStateHash", undefined],
        ] as const) {
            const storedMeta = JSON.stringify({ ...meta, [field]: value });
            await writeFile(metaPath, storedMeta);
            try {
                const rejected = await run(resumeArgList);
                expect(rejected.exitCode).toBe(1);
                expect(rejected.stderr).toContain(field);
                expect(await readFile(resultPath, "utf-8")).toBe(pendingResult);
                expect(await readFile(metaPath, "utf-8")).toBe(storedMeta);
            } finally {
                await writeFile(metaPath, originalMeta);
            }
        }
    }, 120_000);
});

describe("run worker with fake sender", () => {
    test("scripted sender completes when a renamed file is covered by its head path", async () => {
        const env = childEnv({ BENCHMARK_FAKE_SENDER: "scripted", BENCHMARK_FAKE_SUB_DELAY_MS: "400" });
        const proc = spawnWorkerChild(env, 1, "scripted");
        const [stdout, stderr, exitCode] = await Promise.all([
            new Response(proc.stdout).text(),
            new Response(proc.stderr).text(),
            proc.exited,
        ]);
        if (exitCode !== 0) {
            console.log(stdout, stderr);
        }
        expect(exitCode).toBe(0);

        const record = await readRunJson("fixture__1__r1a1__scripted");
        expect(record.status).toBe("completed");
        expect(record.coverageMissList).toEqual([]);
        expect(record.postedCommentCount).toBe(1);
        expect(record.evaluation).toBe("good");
        expect(record.reviewUnitCount).toBe(2);

        const timing = record.timing as PhaseTiming;
        // Phase durations partition the review and preparation stays outside.
        expect(timing.prepareMs).toBeGreaterThanOrEqual(0);
        for (const key of ["setupMs", "planMs", "subWallMs", "writingMs", "finalizeMs"] as const) {
            expect(typeof timing[key]).toBe("number");
            expect(timing[key]).toBeGreaterThanOrEqual(0);
        }

        // Parallel wall time: two subs delayed 400ms each settle in well
        // under the 800ms sum of their individual durations.
        const subDurationList = record.subAgentList.map((sub) => sub.durationMs);
        expect(subDurationList.length).toBe(2);
        const subDurationSum = subDurationList.reduce((acc, value) => acc + value, 0);
        expect(timing.subWallMs!).toBeGreaterThanOrEqual(350);
        expect(timing.subWallMs!).toBeLessThan(subDurationSum);

        // Sender boundary accounting: plan 3 + sub 2 + writing 2 requests.
        expect(record.sender.requestCount).toBe(7);
        expect(record.sender.retryCount ?? 0).toBe(0);
        expect(record.sender.includesConcurrencyWait).toBe(true);
        expect(record.tokenUsage.inputToken).toBe(700);
        expect(record.loopStepCount).toBeGreaterThan(0);

        const eventRaw = await readFile(
            join(dataDir, "output", "test-batch", "attempt", "fixture__1__r1a1__scripted", "event.jsonl"),
            "utf-8",
        );
        const eventList = eventRaw
            .split("\n")
            .filter(Boolean)
            .map((line) => JSON.parse(line));
        const phaseOrder = eventList
            .filter((entry) => entry.event.type === "phase-start")
            .map((entry) => entry.event.phase);
        expect(phaseOrder).toEqual(["setup", "plan", "sub", "writing", "finalize"]);
        const loopEndList = eventList.filter(
            (entry) => entry.event.type === "agent" && entry.event.event.type === "loop-end",
        );
        expect(loopEndList.length).toBe(4);
        for (const entry of loopEndList) {
            expect(entry.event.event.outcome).toBe("completed");
        }
    }, 120_000);

    test("failing sender produces a failed record with partial output", async () => {
        const env = childEnv({ BENCHMARK_FAKE_SENDER: "fail" });
        const proc = spawnWorkerChild(env, 2, "fail");
        const exitCode = await proc.exited;
        expect(exitCode).toBe(0);
        const record = await readRunJson("fixture__1__r1a2__fail");
        expect(record.status).toBe("failed");
        expect(record.statusReason).toBe("review-error");
        expect(record.error).toContain("fake model failure");
        expect(record.timing.reviewMs).toBeGreaterThanOrEqual(0);
        expect(record.phase).toBe("plan");
    }, 120_000);

    test("compression is counted and its request goes through sender accounting", async () => {
        const env = childEnv({ BENCHMARK_FAKE_SENDER: "compress-once" });
        const { exitCode, stdout, stderr, record } = await runWorkerChild(env, 4, "compress");
        if (exitCode !== 0) console.log(stdout, stderr);
        expect(exitCode).toBe(0);
        expect(record.status).toBe("completed");
        const eventRaw = await readFile(
            join(dataDir, "output", "test-batch", "attempt", "fixture__1__r1a4__compress", "event.jsonl"),
            "utf-8",
        );
        const compressionEventList = eventRaw
            .split("\n")
            .filter(Boolean)
            .map((line) => JSON.parse(line))
            .filter((entry) => entry.event.type === "agent" && entry.event.event.type === "compression");
        // The injected overflow must be visible. The fake reports a flat
        // token count, so the learned context limit keeps proactive
        // compression active afterwards. Both kinds are counted.
        const overflowList = compressionEventList.filter((entry) => entry.event.event.reason === "overflow");
        expect(overflowList.length).toBe(1);
        // Compression summary requests go through the sender boundary too.
        expect(record.sender.compressionCount).toBe(compressionEventList.length);
        expect(record.sender.requestCount).toBe(7 + compressionEventList.length);
        expect(record.tokenUsage).toEqual({
            inputToken: record.sender.inputToken,
            outputToken: record.sender.outputToken,
            cachedInputToken: record.sender.cachedInputToken,
        });
        expect(record.tokenUsage.inputToken).toBe((7 + compressionEventList.length) * 100);
        expect(record.tokenUsage.outputToken).toBe((7 + compressionEventList.length) * 10);
    }, 120_000);

    test("a renamed file is also covered by its old path", async () => {
        const path = await writeChangedManifest("rename", async () => {
            await git(["mv", "src/a.ts", "src/renamed.ts"], repoDir);
        });
        const env = childEnv({ BENCHMARK_FAKE_SENDER: "scripted", BENCHMARK_MANIFEST_PATH: path });
        const { exitCode, record } = await runWorkerChild(env, 9, "rename");
        expect(exitCode).toBe(0);
        expect(record.error).toBeNull();
        expect(record.status).toBe("completed");
        expect(record.coverageMissList).toEqual([]);
    }, 120_000);

    test("an unassigned changed file still makes the review incomplete", async () => {
        const path = await writeChangedManifest("unassigned", async () => {
            await writeFile(join(repoDir, "src", "c.ts"), "export const c = 1;\n");
        });
        const env = childEnv({ BENCHMARK_FAKE_SENDER: "scripted", BENCHMARK_MANIFEST_PATH: path });
        const { exitCode, record } = await runWorkerChild(env, 10, "unassigned");
        expect(exitCode).toBe(0);
        expect(record.error).toBeNull();
        expect(record.status).toBe("incomplete");
        expect(record.statusReason).toBe("coverage-miss");
        expect(record.coverageMissList).toEqual(["src/c.ts"]);
    }, 120_000);

    test("forced step exhaustion is recorded as incomplete", async () => {
        const env = childEnv({ BENCHMARK_FAKE_SENDER: "plan-loop-forever" });
        const { exitCode, stdout, stderr, record } = await runWorkerChild(env, 5, "maxsteps");
        if (exitCode !== 0) console.log(stdout, stderr);
        expect(exitCode).toBe(0);
        expect(record.status).toBe("incomplete");
        expect(record.statusReason).toBe("max-steps");
        expect(record.reviewUnitCount).toBe(0);
    }, 120_000);

    test("missing handoff is recorded as a distinct failure", async () => {
        const env = childEnv({ BENCHMARK_FAKE_SENDER: "no-handoff" });
        const { exitCode, stdout, stderr, record } = await runWorkerChild(env, 6, "nohandoff");
        if (exitCode !== 0) console.log(stdout, stderr);
        expect(exitCode).toBe(0);
        expect(record.status).toBe("failed");
        expect(record.error).toContain("failed to submit handoff");
    }, 120_000);

    test("cancelling through the activity row stops the review as canceled", async () => {
        const env = childEnv({ BENCHMARK_FAKE_SENDER: "scripted", BENCHMARK_FAKE_SUB_DELAY_MS: "6000" });
        const proc = spawnWorkerChild(env, 7, "cancel");
        const dbPath = join(dataDir, "output", "test-batch", "tmp", "fixture__1__r1a7__cancel.db");
        // Wait for the child to migrate its database and create the row,
        // then mark that row canceled like the production cancel path does.
        let canceled = false;
        for (let i = 0; i < 60 && !canceled; i++) {
            await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
            try {
                const { Database } = await import("bun:sqlite");
                const db = new Database(dbPath);
                const row = db.query("select count(*) as count from activity").get() as { count: number };
                if (row.count > 0) {
                    db.run("update activity set status = 'canceled'");
                    canceled = true;
                }
                db.close();
            } catch {
                // Database or row not ready yet.
            }
        }
        expect(canceled).toBe(true);
        const exitCode = await proc.exited;
        expect(exitCode).toBe(0);
        const record = await readRunJson("fixture__1__r1a7__cancel");
        expect(record.status).toBe("canceled");
        expect(record.statusReason).toBe("job-canceled");
        expect(record.timing.reviewMs).toBeGreaterThanOrEqual(0);
    }, 120_000);

    test("a preparation failure is recorded as prepareFailed", async () => {
        const badManifestPath = join(rootDir, "manifest-bad.json");
        const goodManifest = JSON.parse(await readFile(manifestPath, "utf-8"));
        goodManifest.caseList[0].repoUrl = join(rootDir, "does-not-exist").replaceAll("\\", "/");
        await writeFile(badManifestPath, JSON.stringify(goodManifest, null, 2));
        const env = childEnv({ BENCHMARK_FAKE_SENDER: "scripted", BENCHMARK_MANIFEST_PATH: badManifestPath });
        const { exitCode, record } = await runWorkerChild(env, 8, "badprepare");
        expect(exitCode).toBe(0);
        expect(record.status).toBe("prepareFailed");
        expect(record.timing.prepareMs).toBeGreaterThanOrEqual(0);
    }, 120_000);

    test("slow sender keeps running until killed and leaves a non terminal record", async () => {
        const env = childEnv({ BENCHMARK_FAKE_SENDER: "slow" });
        const proc = spawnWorkerChild(env, 3, "slow");
        // No benchmark deadline: the review stays alive while the model hangs.
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 8000));
        expect(proc.exitCode).toBe(null);
        const running = await readRunJson("fixture__1__r1a3__slow");
        expect(running.status).toBe("running");
        proc.kill("SIGTERM");
        await proc.exited;
        const after = await readRunJson("fixture__1__r1a3__slow");
        expect(after.status).toBe("running");
    }, 120_000);
});
