import { describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
    compareBatch,
    median,
    renderCompareText,
    renderReportText,
    sizeBucket,
    summarizeBatch,
    summarizeGroupList,
} from "./report.js";
import type { AttemptRecord } from "../types.js";

function record(partial: Partial<AttemptRecord> & Pick<AttemptRecord, "caseId" | "repeatIndex">): AttemptRecord {
    return {
        runId: `${partial.caseId}__r${partial.repeatIndex}a1__t`,
        attemptIndex: 1,
        status: "completed",
        project: "proj",
        changedFileCount: 3,
        addedLineCount: 50,
        deletedLineCount: 30,
        timing: {
            prepareMs: 100,
            reviewMs: 1000,
            setupMs: 100,
            planMs: 200,
            subWallMs: 400,
            writingMs: 250,
            finalizeMs: 50,
        },
        tokenUsage: { inputToken: 1000, outputToken: 100, cachedInputToken: 50 },
        sender: { requestCount: 5 },
        reviewUnitCount: 2,
        postedCommentCount: 1,
        postedInlineCount: 0,
        repro: { manifestHash: "fixture-manifest" },
        ...partial,
    };
}

const interruptedRecord: AttemptRecord = {
    runId: "a__1__r1a1__interrupted",
    caseId: "a__1",
    repeatIndex: 1,
    attemptIndex: 1,
    status: "interrupted",
};

async function runCommand(dir: string, argList: string[]) {
    const proc = Bun.spawn([process.execPath, resolve(import.meta.dir, "../index.ts"), ...argList], {
        stdout: "pipe",
        stderr: "pipe",
        env: {
            ...process.env,
            BENCHMARK_DATA_DIR: dir,
            BENCHMARK_MANIFEST_PATH: join(dir, "missing-manifest.json"),
        },
    });
    const [stdout, stderr, exitCode] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
    ]);
    return { stdout, stderr, exitCode };
}

describe("sizeBucket", () => {
    test("classifies by added plus deleted lines", () => {
        expect(sizeBucket(0, 0)).toBe("BZ");
        expect(sizeBucket(60, 40)).toBe("S");
        expect(sizeBucket(61, 40)).toBe("M");
        expect(sizeBucket(300, 201)).toBe("L");
        expect(sizeBucket(1500, 501)).toBe("XL");
    });

    test("keeps missing or invalid line counts distinct from zero text change", () => {
        expect(sizeBucket()).toBe("unknown");
        expect(sizeBucket(0, undefined)).toBe("unknown");
        expect(sizeBucket(-1, 10)).toBe("unknown");
        expect(sizeBucket(Number.NaN, 10)).toBe("unknown");
    });
});

describe("median", () => {
    test("handles odd and even counts", () => {
        expect(median([3, 1, 2])).toBe(2);
        expect(median([4, 1, 3, 2])).toBe(2.5);
        expect(median([])).toBe(null);
    });
});

describe("summarizeBatch", () => {
    const recordList = [
        record({
            caseId: "a__1",
            repeatIndex: 1,
            timing: { ...record({ caseId: "x", repeatIndex: 1 }).timing!, reviewMs: 1000 },
        }),
        record({
            caseId: "a__1",
            repeatIndex: 2,
            timing: { ...record({ caseId: "x", repeatIndex: 1 }).timing!, reviewMs: 2000 },
        }),
        record({
            caseId: "a__1",
            repeatIndex: 3,
            timing: { ...record({ caseId: "x", repeatIndex: 1 }).timing!, reviewMs: 3000 },
        }),
        record({ caseId: "a__1", repeatIndex: 3, attemptIndex: 2, status: "failed" }),
        record({ caseId: "b__2", repeatIndex: 1, project: "proj", addedLineCount: 900, deletedLineCount: 900 }),
    ];

    test("computes per case median and range over completed attempts only", () => {
        const summaryList = summarizeBatch(recordList);
        const a = summaryList.find((item) => item.caseId === "a__1")!;
        expect(a.medianReviewMs).toBe(2000);
        expect(a.minReviewMs).toBe(1000);
        expect(a.maxReviewMs).toBe(3000);
        expect(a.statusCount).toEqual({ completed: 3, failed: 1 });
        expect(a.bucket).toBe("S");
        const b = summaryList.find((item) => item.caseId === "b__2")!;
        expect(b.bucket).toBe("L");
    });

    test("groups by project and size with status disclosure", () => {
        const groupList = summarizeGroupList(summarizeBatch(recordList));
        const sGroup = groupList.find((item) => item.bucket === "S")!;
        expect(sGroup.caseCount).toBe(1);
        expect(sGroup.completedCaseCount).toBe(1);
        expect(sGroup.statusCount).toEqual({ completed: 3, failed: 1 });
        expect(sGroup.medianOfCaseMedianMs).toBe(2000);
    });

    test("report text mentions failed statuses alongside latency", () => {
        const text = renderReportText("batch-fixture", recordList);
        expect(text).toContain("Failed 1");
        expect(text).toContain("a\\_\\_1");
        expect(text).toContain("2.0 s");
    });

    test("uses sender token totals including compression from saved attempts", () => {
        const summary = summarizeBatch([
            record({
                caseId: "compressed__1",
                repeatIndex: 1,
                tokenUsage: { inputToken: 700, outputToken: 70, cachedInputToken: 0 },
                sender: { requestCount: 9, inputToken: 900, outputToken: 90, cachedInputToken: 100 },
            }),
        ])[0]!;
        expect(summary.medianInputToken).toBe(900);
        expect(summary.medianOutputToken).toBe(90);
        expect(summary.medianCachedInputToken).toBe(100);
    });

    test("falls back to recorded token usage when sender totals are unavailable", () => {
        const summary = summarizeBatch([record({ caseId: "legacy__1", repeatIndex: 1 })])[0]!;
        expect(summary.medianInputToken).toBe(1000);
        expect(summary.medianOutputToken).toBe(100);
        expect(summary.medianCachedInputToken).toBe(50);
    });

    test.each(["completed", "failed"] as const)(
        "uses valid case metadata after an interruption and a %s retry",
        (status) => {
            const summaryList = summarizeBatch([
                interruptedRecord,
                record({
                    caseId: "a__1",
                    repeatIndex: 1,
                    attemptIndex: 2,
                    status,
                    project: "grafana",
                    addedLineCount: 200,
                    deletedLineCount: 10,
                    changedFileCount: 5,
                }),
            ]);
            expect(summaryList[0]).toMatchObject({
                project: "grafana",
                bucket: "M",
                changedFileCount: 5,
                statusCount: { interrupted: 1, [status]: 1 },
                medianReviewMs: status === "completed" ? 1000 : null,
            });
            expect(summarizeGroupList(summaryList)[0]).toMatchObject({
                project: "grafana",
                bucket: "M",
                medianChangedFileCount: 5,
            });
        },
    );

    test("keeps unknown metadata visible without inventing a zero value", () => {
        const recordList = [interruptedRecord];
        expect(summarizeBatch(recordList)[0]).toMatchObject({
            project: "unknown",
            bucket: "unknown",
            changedFileCount: null,
        });
        expect(summarizeGroupList(summarizeBatch(recordList))[0]?.medianChangedFileCount).toBeNull();
        expect(renderReportText("legacy", recordList)).toContain("| a\\_\\_1 | unknown | - | - | Interrupted 1 |");
        const zero = record({
            caseId: "zero",
            repeatIndex: 1,
            addedLineCount: 0,
            deletedLineCount: 0,
            changedFileCount: 0,
        });
        expect(summarizeBatch([zero])[0]).toMatchObject({ bucket: "BZ", changedFileCount: 0 });
    });

    test("excludes missing file counts from the group median", () => {
        const group = summarizeGroupList(
            summarizeBatch([
                record({ caseId: "a__1", repeatIndex: 1, changedFileCount: undefined }),
                record({ caseId: "b__2", repeatIndex: 1, changedFileCount: 5 }),
            ]),
        )[0];
        expect(group?.medianChangedFileCount).toBe(5);
    });
});

describe("compareBatch", () => {
    const baselineList = [
        record({
            caseId: "a__1",
            repeatIndex: 1,
            timing: { ...record({ caseId: "x", repeatIndex: 1 }).timing!, reviewMs: 1000 },
        }),
        record({
            caseId: "a__1",
            repeatIndex: 2,
            timing: { ...record({ caseId: "x", repeatIndex: 1 }).timing!, reviewMs: 2000 },
        }),
        record({ caseId: "b__2", repeatIndex: 1 }),
        record({ caseId: "c__3", repeatIndex: 1 }),
    ];
    const candidateList = [
        record({
            caseId: "a__1",
            repeatIndex: 1,
            timing: { ...record({ caseId: "x", repeatIndex: 1 }).timing!, reviewMs: 500 },
        }),
        record({
            caseId: "a__1",
            repeatIndex: 2,
            timing: { ...record({ caseId: "x", repeatIndex: 1 }).timing!, reviewMs: 1000 },
        }),
        record({ caseId: "b__2", repeatIndex: 1, status: "incomplete", statusReason: "max-steps" }),
        // c__3 has no candidate attempt at all.
    ];

    test("pairs completed attempts of the same case and repeat", () => {
        const result = compareBatch(baselineList, candidateList);
        const a = result.rowList.find((row) => row.caseId === "a__1")!;
        expect(a.pairCount).toBe(2);
        expect(a.baselineMedianMs).toBe(1500);
        expect(a.candidateMedianMs).toBe(750);
        expect(a.relativeChange).toBe(-0.5);
        expect(result.medianRelativeChange).toBe(-0.5);
    });

    test("keeps unpaired and regressed cases visible", () => {
        const result = compareBatch(baselineList, candidateList);
        expect(result.unpairedList.map((item) => item.caseId).sort()).toEqual(["b__2", "c__3"]);
        const regression = result.regressionList.find((item) => item.caseId === "b__2")!;
        expect(regression.side).toBe("candidate");
        expect(regression.status).toEqual({ incomplete: 1 });
        const text = renderCompareText("base", "cand", result);
        expect(text).toContain("Non completed attempt");
        expect(text).toContain("Incomplete 1");
        expect(text).toContain("PR without a completed pair");
    });

    test("rejects the same case and repeat when frozen input differs", () => {
        const changed = candidateList.map((entry) => ({ ...entry, repro: { manifestHash: "changed-manifest" } }));
        expect(() => compareBatch(baselineList, changed)).toThrow("frozen manifest differs");
    });

    test("rejects missing input identity and a mixture within one batch", () => {
        const missing = candidateList.map((entry) => ({ ...entry, repro: undefined }));
        expect(() => compareBatch(baselineList, missing)).toThrow("manifest identity is missing");
        const mixed = [...candidateList, record({ caseId: "a__1", repeatIndex: 3, repro: { manifestHash: "other" } })];
        expect(() => compareBatch(baselineList, mixed)).toThrow("frozen manifest differs");
    });

    test("allows a model and code change with the same frozen input", () => {
        const changed = candidateList.map((entry) => ({
            ...entry,
            repro: { ...entry.repro, modelName: "other-model", sourceStateHash: "other-code" },
        }));
        expect(compareBatch(baselineList, changed).medianRelativeChange).toBe(-0.5);
    });

    test("keeps interruption history without requiring missing timing metadata", () => {
        const result = compareBatch(baselineList, [interruptedRecord, ...candidateList]);
        expect(result.medianRelativeChange).toBe(-0.5);
        expect(result.rowList.find((entry) => entry.caseId === "a__1")).toMatchObject({ project: "proj", bucket: "S" });
        expect(result.regressionList.find((entry) => entry.caseId === "a__1")?.status).toEqual({ interrupted: 1 });
    });
});

describe("Markdown report", () => {
    test("shows the fixed plan and attempt history without treating a retry as another planned review", () => {
        const text = renderReportText(
            "partial",
            [
                { ...interruptedRecord, statusReason: "process-exited-before-terminal-record" },
                record({ caseId: "a__1", repeatIndex: 1, attemptIndex: 2 }),
            ],
            {
                profileName: "full",
                repeatCount: 3,
                caseIdList: ["a__1", "b__2"],
                modelName: "fixture-model",
                modelProvider: "fixture-provider",
                caseInfoList: [
                    {
                        caseId: "b__2",
                        project: "grafana",
                        addedLineCount: 200,
                        deletedLineCount: 10,
                        changedFileCount: 5,
                    },
                ],
            },
        );
        expect(text).toContain("| Planned review | Recorded attempt | Completed attempt | Awaiting result |");
        expect(text).toContain("| 6 | 2 | 1 | 5 |");
        expect(text).toContain("| b\\_\\_2 | M | 210 | 5 | Awaiting result 3 | - | - |");
        expect(text).toContain("Completed 1, Interrupted 1, Awaiting result 2");
        expect(text).toContain("| Model | fixture-provider / fixture-model |");
        expect(text).toContain("| a\\_\\_1 | 1,000 | 100 | 50 | 5 |");
        expect(text).toContain("Process ended without a final result");
        expect(text).toContain("<details>");
        expect(text).not.toMatch(/\{\{\w+\}\}/);
    });

    test("escapes Markdown cell content and only renders explicit metadata fields", () => {
        const meta = {
            modelName: "model | extra\n<script>bad</script>",
            apiKey: "must-stay-private",
            modelBaseUrl: "https://must-stay-private@example.com",
        };
        const text = renderReportText("batch|name", [record({ caseId: "case|name", repeatIndex: 1 })], meta);
        expect(text).toContain("| Batch | batch\\|name |");
        expect(text).toContain("model \\| extra &lt;script&gt;bad&lt;/script&gt;");
        expect(text).not.toContain("<script>");
        expect(text).not.toContain("must-stay-private");
    });

    test("shows partial failure timing separately from successful latency", () => {
        const failed = record({ caseId: "failed", repeatIndex: 1, status: "incomplete", statusReason: "max-steps" });
        const text = renderReportText("failed-batch", [failed]);
        expect(text).toContain("| failed | S | 80 | 3 | Incomplete 1 | - | - |");
        expect(text).toContain("| failed | 1 | 1 | Incomplete | 1.0 s | Agent step limit reached |");
    });

    test("writes a report before the first result exists", async () => {
        const dir = await mkdtemp(join(tmpdir(), "proval-bench-empty-report-"));
        try {
            const batchDir = join(dir, "output", "empty");
            await mkdir(batchDir, { recursive: true });
            await writeFile(join(batchDir, "run.json"), JSON.stringify({ caseIdList: ["pending"], repeatCount: 3 }));
            const result = await runCommand(dir, ["report", "empty"]);
            expect(result.exitCode).toBe(0);
            expect(result.stdout).toContain("| 3 | 0 | 0 | 3 |");
            expect(result.stdout).toContain("| pending | unknown | - | - | Awaiting result 3 | - | - |");
            expect(await readFile(join(batchDir, "report.md"), "utf-8")).toBe(result.stdout);
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    });
});

describe("case metadata in saved batch output", () => {
    test("report and compare use the batch snapshot and preserve legacy output", async () => {
        const dir = await mkdtemp(join(tmpdir(), "proval-bench-metadata-"));
        try {
            const caseInfo = {
                caseId: "a__1",
                project: "grafana",
                addedLineCount: 200,
                deletedLineCount: 10,
                changedFileCount: 5,
            };
            const batchMeta = { manifestHash: "fixture-manifest", caseInfoList: [caseInfo] };
            const completed = record({ caseId: "a__1", repeatIndex: 1, attemptIndex: 2 });
            const writeResult = async (batchId: string, recordList: AttemptRecord[]) => {
                const content =
                    recordList.map((entry) => JSON.stringify({ ...entry, type: "result" })).join("\n") + "\n";
                await writeFile(join(dir, "output", batchId, "result.jsonl"), content);
                return content;
            };
            for (const batchId of ["base", "candidate"]) {
                const batchDir = join(dir, "output", batchId);
                await mkdir(batchDir, { recursive: true });
                await writeFile(join(batchDir, "run.json"), JSON.stringify(batchMeta));
                await writeResult(batchId, [interruptedRecord, completed]);
            }
            const resultPath = join(dir, "output", "candidate", "result.jsonl");
            const originalResult = await readFile(resultPath, "utf-8");
            const report = await runCommand(dir, ["report", "candidate"]);
            expect(report.exitCode).toBe(0);
            expect(report.stdout).toContain("| grafana | M | 1 | 1 |");
            expect(report.stdout).toContain("| a\\_\\_1 | M | 210 | 5 | Completed 1, Interrupted 1 | 1.0 s |");
            expect(await readFile(join(dir, "output", "candidate", "report.md"), "utf-8")).toBe(report.stdout);
            const comparison = await runCommand(dir, ["compare", "base", "candidate"]);
            expect(comparison.exitCode).toBe(0);
            expect(comparison.stdout).toContain("| a\\_\\_1 | M | 1 | 1.0 s | 1.0 s | 0.0% |");
            expect(await readFile(resultPath, "utf-8")).toBe(originalResult);

            // Static information remains available even when no attempt completes.
            await writeResult("candidate", [interruptedRecord]);
            const interrupted = await runCommand(dir, ["report", "candidate"]);
            expect(interrupted.exitCode).toBe(0);
            expect(interrupted.stdout).toContain("| a\\_\\_1 | M | 210 | 5 | Interrupted 1 |");

            // Older output has no snapshot and must use available attempt metadata.
            await writeFile(
                join(dir, "output", "candidate", "run.json"),
                JSON.stringify({ manifestHash: "fixture-manifest" }),
            );
            await writeResult("candidate", [interruptedRecord, { ...completed, ...caseInfo }]);
            const legacy = await runCommand(dir, ["report", "candidate"]);
            expect(legacy.exitCode).toBe(0);
            expect(legacy.stdout).toContain("| a\\_\\_1 | M | 210 | 5 | Completed 1, Interrupted 1 |");
            await writeResult("candidate", [interruptedRecord]);
            const unknown = await runCommand(dir, ["report", "candidate"]);
            expect(unknown.exitCode).toBe(0);
            expect(unknown.stdout).toContain("| a\\_\\_1 | unknown | - | - | Interrupted 1 |");
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    }, 30_000);
});

describe("compare command", () => {
    test("checks saved batch and attempt identity before writing a comparison", async () => {
        const dir = await mkdtemp(join(tmpdir(), "proval-bench-compare-"));
        try {
            const baselineDir = join(dir, "output", "base");
            const candidateDir = join(dir, "output", "candidate");
            await mkdir(baselineDir, { recursive: true });
            await mkdir(candidateDir, { recursive: true });
            const baseline = record({ caseId: "a__1", repeatIndex: 1 });
            const writeBatch = async (batchDir: string, manifestHash: string | undefined, entry: AttemptRecord) => {
                await writeFile(join(batchDir, "run.json"), JSON.stringify({ manifestHash }));
                await writeFile(join(batchDir, "result.jsonl"), JSON.stringify({ ...entry, type: "result" }) + "\n");
            };
            await writeBatch(baselineDir, "fixture-manifest", baseline);
            const comparisonPath = join(candidateDir, "compare-base.md");
            await writeFile(comparisonPath, "previous comparison");
            for (const [manifestHash, entry, expectedError] of [
                ["changed-manifest", baseline, "frozen manifest differs"],
                [undefined, baseline, "manifest identity is missing"],
                ["fixture-manifest", { ...baseline, repro: { manifestHash: "other" } }, "frozen manifest differs"],
                ["fixture-manifest", { ...baseline, repro: undefined }, "manifest identity is missing"],
                ["fixture-manifest", baseline, null],
            ] as const) {
                await writeBatch(candidateDir, manifestHash, entry);
                const { stdout, stderr, exitCode } = await runCommand(dir, ["compare", "base", "candidate"]);
                expect(exitCode).toBe(expectedError ? 1 : 0);
                if (expectedError) {
                    expect(stderr).toContain(expectedError);
                    expect(await readFile(comparisonPath, "utf-8")).toBe("previous comparison");
                } else {
                    expect(stdout).toContain("a\\_\\_1");
                    expect(await readFile(comparisonPath, "utf-8")).toContain("0.0%");
                }
            }
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    }, 30_000);
});
