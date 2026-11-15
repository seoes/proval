import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildRootReadme, renderBatchReadme } from "./readme.js";
import {
    assertValidBatchId,
    gitAuthorizationHeader,
    publishBatch,
    publishFileNameList,
    resolveResultRepoUrl,
    sanitizeResultJsonl,
    sanitizeRunJson,
} from "./publish.js";

function gitExecutable(): string {
    const path = Bun.which("git");
    if (!path) return "git";
    try {
        return realpathSync(path);
    } catch {
        return path;
    }
}

function gitSpawnWorks(): boolean {
    try {
        const git = gitExecutable();
        if (git === "git" && !Bun.which("git")) return false;
        const proc = Bun.spawnSync([git, "--version"], { stdout: "ignore", stderr: "ignore" });
        return proc.exitCode === 0;
    } catch {
        return false;
    }
}

async function runGit(argList: string[], cwd?: string): Promise<void> {
    const git = gitExecutable();
    if (git === "git" && !Bun.which("git")) throw new Error("git is not available");
    const proc = Bun.spawnSync([git, ...argList], { cwd, stdout: "pipe", stderr: "pipe" });
    if (proc.exitCode !== 0) {
        const stderr = proc.stderr?.toString() ?? "";
        throw new Error(`git ${argList[0]} failed (${proc.exitCode}): ${stderr}`);
    }
}

describe("resolveResultRepoUrl", () => {
    test("requires RESULT_REPO_URL", () => {
        const previous = process.env.RESULT_REPO_URL;
        delete process.env.RESULT_REPO_URL;
        expect(() => resolveResultRepoUrl()).toThrow("Missing RESULT_REPO_URL");
        process.env.RESULT_REPO_URL = previous;
    });
});

describe("gitAuthorizationHeader", () => {
    test("uses basic auth so GitHub git does not prompt for a username", () => {
        const header = gitAuthorizationHeader("github_pat_example");
        expect(header.startsWith("AUTHORIZATION: basic ")).toBe(true);
        expect(header.toLowerCase()).not.toContain("bearer");
        const encoded = header.slice("AUTHORIZATION: basic ".length);
        expect(Buffer.from(encoded, "base64").toString("utf8")).toBe("x-access-token:github_pat_example");
    });
});

describe("assertValidBatchId", () => {
    test("rejects path segments", () => {
        expect(() => assertValidBatchId("../escape")).toThrow("Invalid batch id");
        expect(() => assertValidBatchId("bad/id")).toThrow("Invalid batch id");
    });
});

describe("sanitizeRunJson", () => {
    test("removes sensitive run metadata", () => {
        const raw = JSON.stringify({
            batchId: "quick-1",
            modelBaseUrl: "https://secret.example/v1",
            machineDescription: "secret machine",
            modelName: "model",
        });
        const parsed = JSON.parse(sanitizeRunJson(raw)) as Record<string, unknown>;
        expect(parsed.modelBaseUrl).toBeUndefined();
        expect(parsed.machineDescription).toBeUndefined();
        expect(parsed.modelName).toBe("model");
    });
});

describe("sanitizeResultJsonl", () => {
    test("removes sensitive fields from the line and nested repro", () => {
        const raw = [
            JSON.stringify({
                type: "result",
                modelBaseUrl: "https://secret.example/v1",
                machineDescription: "secret machine",
                repro: {
                    modelName: "fixture",
                    modelBaseUrl: "https://private.example/v1",
                    machineDescription: "secret runner",
                },
            }),
            "",
        ].join("\n");
        const line = sanitizeResultJsonl(raw).split("\n")[0] ?? "";
        const parsed = JSON.parse(line) as {
            modelBaseUrl?: string;
            machineDescription?: string;
            repro?: { modelName?: string; modelBaseUrl?: string; machineDescription?: string };
        };
        expect(parsed.modelBaseUrl).toBeUndefined();
        expect(parsed.machineDescription).toBeUndefined();
        expect(parsed.repro?.modelName).toBe("fixture");
        expect(parsed.repro?.modelBaseUrl).toBeUndefined();
        expect(parsed.repro?.machineDescription).toBeUndefined();
        expect(line).not.toContain("secret.example");
        expect(line).not.toContain("private.example");
        expect(line).not.toContain("secret runner");
    });
});

describe("renderBatchReadme", () => {
    test("leads with the result and keeps match text out of the report", () => {
        const run = {
            profileName: "full",
            repeatCount: 1,
            caseIdList: ["alpha", "zeta"],
            modelProvider: "openai",
            modelName: "fixture",
            startedAt: "2026-03-01T00:00:00.000Z",
            provalCommit: "abcd1234567890abcd1234567890abcd12345678",
            machineDescription: "secret runner",
            modelBaseUrl: "https://private.example/v1",
            caseInfoList: [
                { caseId: "alpha", project: "alpha", addedLineCount: 10, deletedLineCount: 0, changedFileCount: 1 },
                { caseId: "zeta", project: "zeta", addedLineCount: 400, deletedLineCount: 0, changedFileCount: 4 },
            ],
        };
        const result = [
            JSON.stringify({
                type: "result",
                runId: "a",
                caseId: "alpha",
                repeatIndex: 1,
                attemptIndex: 1,
                status: "completed",
                timing: { reviewMs: 60_000 },
            }),
            JSON.stringify({
                type: "result",
                runId: "z",
                caseId: "zeta",
                repeatIndex: 1,
                attemptIndex: 1,
                status: "failed",
                statusReason: "review-error",
                timing: { reviewMs: 1000 },
            }),
        ].join("\n");
        const score = {
            judgeModel: "judge-a",
            beta: 2,
            attemptList: [
                {
                    caseId: "zeta",
                    repeatIndex: 1,
                    attemptIndex: 1,
                    candidateList: ["secret finding text"],
                    evaluation: {
                        candidateCount: 2,
                        goldenCount: 1,
                        tp: 1,
                        fp: 1,
                        fn: 0,
                        truePositiveList: [
                            {
                                goldenComment: "secret finding text",
                                category: "bug",
                                matchedCandidate: "x",
                                confidence: 1,
                            },
                        ],
                        falsePositiveList: [],
                        falseNegativeList: [],
                    },
                },
                {
                    caseId: "alpha",
                    repeatIndex: 1,
                    attemptIndex: 1,
                    dedupFallback: true,
                    evaluation: {
                        skipped: true,
                        reason: "no review",
                        candidateCount: 0,
                        goldenCount: 1,
                        truePositiveList: [],
                        falsePositiveList: [],
                        falseNegativeList: [],
                    },
                },
            ],
            missingRunIdList: [],
            timedOutRunIdList: ["run-slow"],
            primary: {
                core: {
                    precision: 0.5,
                    recall: 1,
                    f1: 2 / 3,
                    fbeta: 5 / 6,
                    tp: 1,
                    fp: 1,
                    fn: 0,
                    attemptCount: 1,
                },
            },
            pooled: {
                core: {
                    precision: 0.5,
                    recall: 1,
                    f1: 2 / 3,
                    fbeta: 5 / 6,
                    tp: 1,
                    fp: 1,
                    fn: 0,
                    attemptCount: 1,
                },
            },
        };
        const text = renderBatchReadme({
            batchId: "full-1",
            runJson: JSON.stringify(run),
            resultJsonl: result,
            scoreJson: JSON.stringify(score),
        });
        expect(text.startsWith("# full-1")).toBe(true);
        expect(text).toContain("https://github.com/withmartian/code-review-benchmark");
        expect(text).toContain("https://codereview.withmartian.com/?mode=offline");
        expect(text.indexOf("## By project")).toBeLessThan(text.indexOf("## PR"));
        expect(text).toContain("| Core F2 | 83.3% |");
        expect(text).not.toContain("secret runner");
        expect(text).not.toContain("private.example");
        expect(text).not.toContain("secret finding text");
        expect(text).toContain("## Problem");
        expect(text).toContain("Timed out: run-slow");
        expect(text).toContain("dedup fallback");
        expect(text.indexOf("| alpha |")).toBeLessThan(text.indexOf("| zeta |"));
        expect(() => renderBatchReadme({ batchId: "x", runJson: "{}", resultJsonl: "", scoreJson: "{}" })).toThrow(
            "Invalid score.json",
        );
    });
});

describe("publishFileNameList", () => {
    test("includes score.json only when present", async () => {
        const dir = await mkdtemp(join(tmpdir(), "proval-publish-file-list-"));
        try {
            await writeFile(join(dir, "run.json"), "{}");
            await writeFile(join(dir, "result.jsonl"), "");
            await writeFile(join(dir, "report.md"), "# report");
            expect(await publishFileNameList(dir)).toEqual(["run.json", "result.jsonl", "README.md"]);
            await writeFile(join(dir, "score.json"), "{}");
            expect(await publishFileNameList(dir)).toEqual(["run.json", "result.jsonl", "README.md", "score.json"]);
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    });
});

describe("buildRootReadme", () => {
    test("sorts newest first and shows dash for missing score", async () => {
        const repoDir = await mkdtemp(join(tmpdir(), "proval-publish-readme-"));
        try {
            const olderDir = join(repoDir, "result", "quick-old");
            const newerDir = join(repoDir, "result", "full-new");
            await mkdir(olderDir, { recursive: true });
            await mkdir(newerDir, { recursive: true });
            await writeFile(
                join(olderDir, "run.json"),
                JSON.stringify({
                    profileName: "quick",
                    startedAt: "2026-01-01T00:00:00.000Z",
                    modelProvider: "openai",
                    modelName: "a",
                    provalCommit: "abcd1234567890abcd1234567890abcd12345678",
                }),
            );
            await writeFile(
                join(newerDir, "run.json"),
                JSON.stringify({
                    profileName: "full",
                    startedAt: "2026-02-01T00:00:00.000Z",
                    modelProvider: "openai",
                    modelName: "b",
                    provalCommit: "abcd1234567890abcd1234567890abcd12345678",
                    isDirty: true,
                }),
            );
            const resultLine = (status: string, reviewMs: number | null) =>
                JSON.stringify({
                    type: "result",
                    runId: "x",
                    caseId: "c",
                    repeatIndex: 1,
                    attemptIndex: 1,
                    status,
                    timing: reviewMs === null ? {} : { reviewMs },
                });
            await writeFile(
                join(olderDir, "result.jsonl"),
                [resultLine("completed", 1000), resultLine("failed", null)].join("\n") + "\n",
            );
            await writeFile(join(newerDir, "result.jsonl"), resultLine("completed", 2000) + "\n");
            const text = await buildRootReadme(repoDir);
            expect(text).toContain("https://github.com/withmartian/code-review-benchmark");
            expect(text).toContain("https://codereview.withmartian.com/?mode=offline");
            expect(text).toContain("## Latest full");
            expect(text).toContain("[full-new](result/full-new/)");
            const tableStart = text.indexOf("## Runs");
            expect(text.indexOf("full-new", tableStart)).toBeLessThan(text.indexOf("quick-old", tableStart));
            expect(text).toContain("| 1 / 2 | 1.0 s | - |");
            expect(text).toContain("abcd12345678 dirty");
        } finally {
            await rm(repoDir, { recursive: true, force: true });
        }
    });
});

describe("publishBatch", () => {
    test.skipIf(!gitSpawnWorks())("writes batch output to a file remote without a token", async () => {
        const root = await mkdtemp(join(tmpdir(), "proval-publish-git-"));
        const dataDir = join(root, "data");
        const remoteDir = join(root, "remote.git");
        const inspectDir = join(root, "inspect");
        try {
            await mkdir(dataDir, { recursive: true });
            await runGit(["init", "--bare", "-b", "main", "remote.git"], root);
            const remoteUrl = `file://${remoteDir}`;
            const seedDir = join(root, "seed");
            await mkdir(seedDir, { recursive: true });
            await runGit(["init", "-b", "main"], seedDir);
            await runGit(["config", "user.email", "test@test.local"], seedDir);
            await runGit(["config", "user.name", "test"], seedDir);
            await writeFile(join(seedDir, ".gitkeep"), "");
            await runGit(["add", ".gitkeep"], seedDir);
            await runGit(["commit", "-m", "init"], seedDir);
            await runGit(["remote", "add", "origin", remoteUrl], seedDir);
            await runGit(["push", "-u", "origin", "main"], seedDir);
            const batchId = "quick-publish-test";
            const batchDir = join(dataDir, "output", batchId);
            await mkdir(batchDir, { recursive: true });
            await writeFile(
                join(batchDir, "run.json"),
                JSON.stringify({
                    batchId,
                    profileName: "quick",
                    startedAt: "2026-03-01T00:00:00.000Z",
                    modelProvider: "openai",
                    modelName: "fixture",
                    modelBaseUrl: "https://private.example/v1",
                    machineDescription: "secret runner",
                    provalCommit: "abcd1234567890abcd1234567890abcd12345678",
                }),
            );
            await writeFile(
                join(batchDir, "result.jsonl"),
                `${JSON.stringify({
                    type: "result",
                    runId: "r1",
                    caseId: "c1",
                    repeatIndex: 1,
                    attemptIndex: 1,
                    status: "completed",
                    timing: { reviewMs: 1500 },
                    modelBaseUrl: "https://top.private.example/v1",
                    machineDescription: "top secret runner",
                    repro: {
                        modelName: "fixture",
                        modelBaseUrl: "https://private.example/v1",
                        machineDescription: "secret runner",
                    },
                })}\n`,
            );
            await writeFile(
                join(batchDir, "report.md"),
                ["# Report", "| Machine | secret |", "| Model | openai / fixture |"].join("\n") + "\n",
            );
            const previousDataDir = process.env.BENCHMARK_DATA_DIR;
            const previousRepoUrl = process.env.RESULT_REPO_URL;
            process.env.BENCHMARK_DATA_DIR = dataDir;
            process.env.RESULT_REPO_URL = remoteUrl;
            delete process.env.RESULT_REPO_TOKEN;
            await publishBatch(batchId);
            const publishedSource = JSON.parse(await readFile(join(batchDir, "run.json"), "utf-8")) as {
                modelName?: string;
            };
            publishedSource.modelName = "rewritten-model";
            await writeFile(join(batchDir, "run.json"), JSON.stringify(publishedSource));
            await publishBatch(batchId);
            await runGit(["clone", remoteUrl, inspectDir], root);
            const log = Bun.spawnSync([gitExecutable(), "log", "-1", "--format=%an%n%ae%n%s"], {
                cwd: inspectDir,
                stdout: "pipe",
                stderr: "pipe",
            });
            expect(log.exitCode).toBe(0);
            expect(log.stdout?.toString().split("\n").slice(0, 3)).toEqual([
                "dowonseo",
                "me@dowonseo.com",
                `Overwrite ${batchId}`,
            ]);
            const publishedRun = JSON.parse(await readFile(join(inspectDir, "result", batchId, "run.json"), "utf-8"));
            expect(publishedRun.modelBaseUrl).toBeUndefined();
            expect(publishedRun.machineDescription).toBeUndefined();
            const publishedResult = await readFile(join(inspectDir, "result", batchId, "result.jsonl"), "utf-8");
            const publishedLine = JSON.parse(publishedResult.trim()) as {
                modelBaseUrl?: string;
                machineDescription?: string;
                repro?: { modelName?: string; modelBaseUrl?: string; machineDescription?: string };
            };
            expect(publishedLine.modelBaseUrl).toBeUndefined();
            expect(publishedLine.machineDescription).toBeUndefined();
            expect(publishedLine.repro?.modelName).toBe("fixture");
            expect(publishedLine.repro?.modelBaseUrl).toBeUndefined();
            expect(publishedLine.repro?.machineDescription).toBeUndefined();
            expect(publishedResult).not.toContain("private.example");
            expect(publishedResult).not.toContain("secret runner");
            const publishedReadme = await readFile(join(inspectDir, "result", batchId, "README.md"), "utf-8");
            expect(publishedReadme).toContain("rewritten-model");
            expect(publishedReadme).not.toContain("secret runner");
            expect(publishedReadme).not.toContain("private.example");
            expect(existsSync(join(inspectDir, "result", batchId, "attempt"))).toBe(false);
            const rootReadme = await readFile(join(inspectDir, "README.md"), "utf-8");
            expect(rootReadme).toContain(`[${batchId}](result/${batchId}/)`);
            expect(existsSync(join(dataDir, "result-repo"))).toBe(false);
            process.env.BENCHMARK_DATA_DIR = previousDataDir;
            process.env.RESULT_REPO_URL = previousRepoUrl;
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });
});
