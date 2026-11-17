import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { median, summarizeBatch } from "../report/report.js";
import { scoreProfile, type Evaluation } from "../score/logic.js";
import type { AttemptRecord, CaseSummary, SizeBucket } from "../types.js";

type CaseInfo = {
    caseId: string;
    project?: string;
    addedLineCount?: number;
    deletedLineCount?: number;
    changedFileCount?: number;
};

type RunFile = {
    profileName?: string;
    repeatCount?: number;
    caseIdList?: string[];
    caseInfoList?: CaseInfo[];
    modelProvider?: string;
    modelName?: string;
    startedAt?: string;
    provalCommit?: string;
    isDirty?: boolean;
};

type ScoreProfile = {
    precision?: number;
    recall?: number;
    f1?: number;
    fbeta?: number;
    tp?: number;
    fp?: number;
    fn?: number;
    attemptCount?: number;
};

type ScoreAttempt = {
    caseId?: string;
    repeatIndex?: number;
    attemptIndex?: number;
    dedupFallback?: boolean;
    evaluation?: unknown;
};

type ScoreFile = {
    judgeModel?: string;
    beta?: number;
    attemptList?: ScoreAttempt[];
    missingRunIdList?: string[];
    timedOutRunIdList?: string[];
    primary?: Record<string, ScoreProfile>;
    pooled?: Record<string, ScoreProfile>;
};

type IndexRow = {
    batchId: string;
    startedAt: string;
    startedLabel: string;
    profileName: string;
    model: string;
    code: string;
    completed: string;
    medianReview: string;
    coreScore: string;
    precision: string;
    recall: string;
    betaLabel: string;
};

const PROFILE_ORDER = ["strict", "core", "all"];
const SIZE_ORDER: SizeBucket[] = ["S", "M", "L", "XL", "BZ", "unknown"];
const STATUS_LABEL: Record<string, string> = {
    completed: "Completed",
    incomplete: "Incomplete",
    failed: "Failed",
    prepareFailed: "Preparation failed",
    canceled: "Canceled",
    interrupted: "Interrupted",
};
const REASON_LABEL: Record<string, string> = {
    "max-steps": "Agent step limit reached",
    "coverage-miss": "Changed file not covered",
    "missing-summary": "No summary posted",
    "review-error": "Review failed",
    "runner-error": "Runner failed",
    "prepare-error": "Input preparation failed",
    "user-cancel": "Canceled by user",
    "job-canceled": "Activity canceled",
    "process-exited-before-terminal-record": "Process ended without a final result",
};

const DATASET_REPO = "https://github.com/withmartian/code-review-benchmark";
const DATASET_BOARD = "https://codereview.withmartian.com/?mode=offline";

const INTRO = [
    "# Proval benchmark results",
    "",
    `These results are our own runs of the [Martian offline code review benchmark](${DATASET_REPO}). The frozen set has 50 pull requests. The runner was rewritten for Proval, and every review was executed here. The public offline board is [here](${DATASET_BOARD}).`,
    "",
    "Each folder under `result/` is one published batch. Open a batch for the grouped view and the PR table. Core score is the primary score. Median review uses completed attempts.",
].join("\n");

function cell(value: string | number): string {
    return String(value).replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function table(headerList: string[], rowList: string[][]): string {
    const line = (cellList: string[]) => `| ${cellList.map(cell).join(" | ")} |`;
    return [line(headerList), line(headerList.map(() => "---")), ...rowList.map(line)].join("\n");
}

function percent(value: number | undefined | null): string {
    if (typeof value !== "number" || !Number.isFinite(value)) return "-";
    return `${(value * 100).toFixed(1)}%`;
}

function count(value: number | undefined | null): string {
    return typeof value === "number" && Number.isFinite(value) ? String(Math.round(value)) : "-";
}

function formatMs(value: number | null): string {
    if (value === null) return "-";
    if (value < 1000) return `${Math.round(value)} ms`;
    if (value >= 60_000) return `${(value / 60_000).toFixed(1)} min`;
    return `${(value / 1000).toFixed(1)} s`;
}

function formatToken(value: number | null): string {
    return value === null ? "-" : Math.round(value).toLocaleString("en-US");
}

function formatWhen(value: string | undefined): string {
    if (!value || value === "-") return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toISOString().slice(0, 16).replace("T", " ");
}

function formatCode(meta: RunFile): string {
    if (!meta.provalCommit?.trim()) return "-";
    const short = meta.provalCommit.slice(0, 12);
    return meta.isDirty ? `${short} dirty` : short;
}

function formatModel(meta: RunFile): string {
    return [meta.modelProvider, meta.modelName].filter(Boolean).join(" / ") || "-";
}

function formatStatus(statusCount: Record<string, number>): string {
    return (
        Object.entries(statusCount)
            .filter(([, value]) => value > 0)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([status, value]) => `${STATUS_LABEL[status] ?? status} ${value}`)
            .join(", ") || "No recorded attempt"
    );
}

function betaLabel(beta: number | null): string {
    if (beta === null) return "Fβ";
    return Number.isInteger(beta) ? `F${beta}` : `F${beta}`;
}

function finiteBeta(value: unknown): number | null {
    return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function loadResultList(content: string): AttemptRecord[] {
    return content
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as AttemptRecord & { type?: string })
        .filter((line) => line.type === "result");
}

function loadRun(content: string): RunFile {
    const value = JSON.parse(content) as RunFile;
    if (!value || typeof value !== "object") throw new Error("Invalid run.json");
    return value;
}

function loadScore(content: string): ScoreFile {
    let document: ScoreFile;
    try {
        document = JSON.parse(content) as ScoreFile;
    } catch {
        throw new Error("Invalid score.json");
    }
    if (!document || typeof document !== "object" || !document.primary || !document.pooled) {
        throw new Error("Invalid score.json");
    }
    return document;
}

function usableEvaluation(value: unknown): Evaluation | null {
    if (!value || typeof value !== "object") return null;
    const raw = value as Partial<Evaluation>;
    if (!Array.isArray(raw.truePositiveList) || !Array.isArray(raw.falseNegativeList)) return null;
    return {
        skipped: Boolean(raw.skipped),
        reason: raw.reason,
        truePositiveList: raw.truePositiveList,
        falsePositiveList: raw.falsePositiveList ?? [],
        falseNegativeList: raw.falseNegativeList,
        errorList: raw.errorList ?? [],
        candidateCount: raw.candidateCount ?? 0,
        goldenCount: raw.goldenCount ?? 0,
        tp: raw.tp ?? 0,
        fp: raw.fp ?? 0,
        fn: raw.fn ?? 0,
        errorCount: raw.errorCount ?? 0,
        candidatePrecision: raw.candidatePrecision ?? 0,
        candidateRecall: raw.candidateRecall ?? 0,
    };
}

function primaryByCase(attemptList: ScoreAttempt[]): Map<string, ScoreAttempt> {
    const sorted = [...attemptList].sort(
        (left, right) =>
            (left.repeatIndex ?? 0) - (right.repeatIndex ?? 0) || (left.attemptIndex ?? 0) - (right.attemptIndex ?? 0),
    );
    const byCase = new Map<string, ScoreAttempt>();
    for (const attempt of sorted) {
        if (!attempt.caseId || byCase.has(attempt.caseId)) continue;
        byCase.set(attempt.caseId, attempt);
    }
    return byCase;
}

function coreScore(
    evaluationList: Evaluation[],
    beta: number,
): ReturnType<typeof scoreProfile> | null {
    const usable = evaluationList.filter((evaluation) => !evaluation.skipped);
    if (usable.length === 0) return null;
    return scoreProfile(usable, new Map(), "core", beta);
}

function profileNameList(record: Record<string, ScoreProfile> | undefined): string[] {
    const present = record ?? {};
    const extra = Object.keys(present)
        .filter((name) => !PROFILE_ORDER.includes(name))
        .sort();
    return [...PROFILE_ORDER.filter((name) => name in present), ...extra];
}

function scoreTable(record: Record<string, ScoreProfile> | undefined, label: string): string {
    return table(
        ["Profile", "Precision", "Recall", "F1", label, "TP", "FP", "FN", "Attempts"],
        profileNameList(record).map((name) => {
            const score = record?.[name];
            return [
                name,
                percent(score?.precision),
                percent(score?.recall),
                percent(score?.f1),
                percent(score?.fbeta),
                count(score?.tp),
                count(score?.fp),
                count(score?.fn),
                count(score?.attemptCount),
            ];
        }),
    );
}

function pooledMatchesPrimary(document: ScoreFile): boolean {
    const nameList = new Set([...profileNameList(document.primary), ...profileNameList(document.pooled)]);
    for (const name of nameList) {
        if (document.primary?.[name]?.attemptCount !== document.pooled?.[name]?.attemptCount) return false;
    }
    return true;
}

function sortCase(summaryList: CaseSummary[]): CaseSummary[] {
    return [...summaryList].sort(
        (left, right) => left.project.localeCompare(right.project) || left.caseId.localeCompare(right.caseId),
    );
}

function range(summaryList: CaseSummary[]): string {
    const valueList = summaryList
        .map((summary) => summary.medianReviewMs)
        .filter((value): value is number => typeof value === "number");
    if (valueList.length === 0) return "-";
    return `${formatMs(Math.min(...valueList))} to ${formatMs(Math.max(...valueList))}`;
}

function coreForCases(
    caseIdList: string[],
    primary: Map<string, ScoreAttempt>,
    beta: number | null,
): string {
    if (beta === null) return "-";
    const evaluationList = caseIdList
        .map((caseId) => usableEvaluation(primary.get(caseId)?.evaluation))
        .filter((evaluation): evaluation is Evaluation => evaluation !== null);
    return percent(coreScore(evaluationList, beta)?.fbeta);
}

function factTable(rowList: [string, string][]): string {
    return table(["", ""], rowList);
}

export function renderBatchReadme(input: {
    batchId: string;
    runJson: string;
    resultJsonl: string;
    scoreJson?: string;
}): string {
    const run = loadRun(input.runJson);
    const recordList = loadResultList(input.resultJsonl);
    const score = input.scoreJson === undefined ? null : loadScore(input.scoreJson);
    const summaryList = sortCase(summarizeBatch(recordList, run.caseInfoList ?? []));
    const beta = finiteBeta(score?.beta);
    const primary = primaryByCase(score?.attemptList ?? []);
    const completedList = recordList.filter((record) => record.status === "completed");
    const reviewMsList = completedList
        .map((record) => record.timing?.reviewMs)
        .filter((value): value is number => typeof value === "number");
    const planned =
        typeof run.repeatCount === "number" && run.repeatCount > 0 && (run.caseIdList?.length ?? 0) > 0
            ? run.caseIdList!.length * run.repeatCount
            : null;
    const core = score?.primary?.core;
    const label = betaLabel(beta);
    const factList: [string, string][] = [
        ["Profile", run.profileName ?? "-"],
        ["Model", formatModel(run)],
        ["Started", formatWhen(run.startedAt)],
        ["Code", formatCode(run)],
        ["Planned", count(planned)],
        ["Recorded", count(recordList.length)],
        ["Completed", count(completedList.length)],
        ["Median review", formatMs(median(reviewMsList))],
    ];
    if (score) {
        factList.push(
            [`Core ${label}`, percent(core?.fbeta)],
            ["Precision", percent(core?.precision)],
            ["Recall", percent(core?.recall)],
            ["Judge", score.judgeModel?.trim() || "-"],
        );
    }
    const lineList = [
        `# ${input.batchId}`,
        "",
        `Run against the [Martian offline code review benchmark](${DATASET_REPO}). The public offline board is [here](${DATASET_BOARD}).`,
        "",
        factTable(factList),
        "",
        "Median review uses completed attempts. Core score is the primary score, from the first scored attempt of each PR.",
        "",
        "## By project",
        "",
        projectTable(summaryList, primary, beta),
        "",
        "Group median is the median of the PR medians.",
        "",
        "## By size",
        "",
        sizeTable(summaryList, primary, beta),
        "",
        "S is up to 100 changed lines. M is up to 500. L is up to 2000. XL is above that. BZ is no text change.",
    ];
    const focus = focusSection(summaryList, primary, beta);
    if (focus) lineList.push("", focus);
    lineList.push("", "## Score", "");
    if (!score) {
        lineList.push("No score was recorded for this batch.");
    } else {
        lineList.push(
            "Primary uses the first scored attempt of each PR. Pooled uses every scored attempt. A profile counts only golden comments in that profile. False positives stay in every profile.",
            "",
            "Strict counts bug, security, concurrency, data and api comments. Core adds performance, test gap and documentation defects. All also adds style and speculative comments.",
            "",
            "### Primary",
            "",
            scoreTable(score.primary, label),
            "",
        );
        if (pooledMatchesPrimary(score)) {
            lineList.push("Pooled matches primary.");
        } else {
            lineList.push("### Pooled", "", scoreTable(score.pooled, label));
        }
    }
    lineList.push(
        "",
        "## PR",
        "",
        "Score columns use the primary core profile.",
        "",
        prTable(summaryList, recordList, primary, beta, run.repeatCount),
    );
    const problem = problemSection(recordList, score);
    if (problem) lineList.push("", problem);
    lineList.push("", detailSection(summaryList, score));
    return `${lineList.join("\n").trim()}\n`;
}

function projectTable(
    summaryList: CaseSummary[],
    primary: Map<string, ScoreAttempt>,
    beta: number | null,
): string {
    const byProject = new Map<string, CaseSummary[]>();
    for (const summary of summaryList) {
        const list = byProject.get(summary.project) ?? [];
        list.push(summary);
        byProject.set(summary.project, list);
    }
    const rowList = [...byProject.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([project, list]) => {
            const medianList = list
                .map((summary) => summary.medianReviewMs)
                .filter((value): value is number => typeof value === "number");
            return [
                project,
                String(list.length),
                String(list.filter((summary) => summary.medianReviewMs !== null).length),
                formatMs(median(medianList)),
                range(list),
                coreForCases(
                    list.map((summary) => summary.caseId),
                    primary,
                    beta,
                ),
            ];
        });
    if (rowList.length === 0) return "No PR was recorded.";
    return table(["Project", "PRs", "Completed", "Median", "Range", "Core score"], rowList);
}

function sizeTable(
    summaryList: CaseSummary[],
    primary: Map<string, ScoreAttempt>,
    beta: number | null,
): string {
    const rowList = SIZE_ORDER.map((bucket) => {
        const list = summaryList.filter((summary) => summary.bucket === bucket);
        if (list.length === 0) return null;
        const medianList = list
            .map((summary) => summary.medianReviewMs)
            .filter((value): value is number => typeof value === "number");
        return [
            bucket,
            String(list.length),
            String(list.filter((summary) => summary.medianReviewMs !== null).length),
            formatMs(median(medianList)),
            range(list),
            coreForCases(
                list.map((summary) => summary.caseId),
                primary,
                beta,
            ),
        ];
    }).filter((row): row is string[] => row !== null);
    if (rowList.length === 0) return "No PR was recorded.";
    return table(["Size", "PRs", "Completed", "Median", "Range", "Core score"], rowList);
}

function focusSection(
    summaryList: CaseSummary[],
    primary: Map<string, ScoreAttempt>,
    beta: number | null,
): string | null {
    if (summaryList.length <= 5) return null;
    const slowList = summaryList
        .filter((summary) => summary.medianReviewMs !== null)
        .sort((left, right) => (right.medianReviewMs ?? 0) - (left.medianReviewMs ?? 0))
        .slice(0, 5);
    const lineList = [
        "## Where to look",
        "",
        "### Slowest",
        "",
        table(
            ["PR", "Project", "Size", "Median"],
            slowList.map((summary) => [
                summary.caseId,
                summary.project,
                summary.bucket,
                formatMs(summary.medianReviewMs),
            ]),
        ),
    ];
    if (beta !== null) {
        const weakList = summaryList
            .map((summary) => {
                const evaluation = usableEvaluation(primary.get(summary.caseId)?.evaluation);
                const score = evaluation ? coreScore([evaluation], beta) : null;
                return { summary, score };
            })
            .filter((item) => item.score !== null)
            .sort((left, right) => (left.score?.fbeta ?? 0) - (right.score?.fbeta ?? 0))
            .slice(0, 5);
        if (weakList.length > 0) {
            lineList.push(
                "",
                "### Lowest core score",
                "",
                table(
                    ["PR", "Project", "Size", "Core score", "TP", "FP", "FN"],
                    weakList.map((item) => [
                        item.summary.caseId,
                        item.summary.project,
                        item.summary.bucket,
                        percent(item.score?.fbeta),
                        count(item.score?.tp),
                        count(item.score?.fp),
                        count(item.score?.fn),
                    ]),
                ),
            );
        }
    }
    return lineList.join("\n");
}

function prTable(
    summaryList: CaseSummary[],
    recordList: AttemptRecord[],
    primary: Map<string, ScoreAttempt>,
    beta: number | null,
    repeatCount: number | undefined,
): string {
    if (summaryList.length === 0) return "No PR was recorded.";
    return table(
        ["PR", "Project", "Size", "Lines", "Files", "Outcome", "Median", "Core score", "TP", "FP", "FN"],
        summaryList.map((summary) => {
            const evaluation = usableEvaluation(primary.get(summary.caseId)?.evaluation);
            const score = evaluation && beta !== null ? coreScore([evaluation], beta) : null;
            const recordedRepeatCount = new Set(
                recordList.filter((record) => record.caseId === summary.caseId).map((record) => record.repeatIndex),
            ).size;
            const awaiting =
                typeof repeatCount === "number" && repeatCount > 0
                    ? Math.max(0, repeatCount - recordedRepeatCount)
                    : 0;
            const outcome = [formatStatus(summary.statusCount), awaiting > 0 ? `Awaiting ${awaiting}` : ""]
                .filter(Boolean)
                .join(", ");
            return [
                summary.caseId,
                summary.project,
                summary.bucket,
                count(summary.changedLineCount),
                count(summary.changedFileCount),
                outcome || "No recorded attempt",
                formatMs(summary.medianReviewMs),
                percent(score?.fbeta),
                count(score?.tp),
                count(score?.fp),
                count(score?.fn),
            ];
        }),
    );
}

function problemSection(recordList: AttemptRecord[], score: ScoreFile | null): string | null {
    const failedList = recordList.filter((record) => record.status !== "completed");
    const missingList = score?.missingRunIdList ?? [];
    const timedOutList = score?.timedOutRunIdList ?? [];
    if (failedList.length === 0 && missingList.length === 0 && timedOutList.length === 0) return null;
    const lineList = ["## Problem", ""];
    if (failedList.length > 0) {
        lineList.push(
            table(
                ["PR", "Repeat", "Attempt", "Status", "Elapsed", "Reason"],
                failedList.map((record) => [
                    record.caseId,
                    count(record.repeatIndex),
                    count(record.attemptIndex),
                    STATUS_LABEL[record.status] ?? record.status,
                    formatMs(record.timing?.reviewMs ?? null),
                    REASON_LABEL[record.statusReason ?? ""] ?? record.statusReason ?? "-",
                ]),
            ),
        );
    }
    if (missingList.length > 0) lineList.push("", `Missing review: ${missingList.map(cell).join(", ")}`);
    if (timedOutList.length > 0) lineList.push("", `Timed out: ${timedOutList.map(cell).join(", ")}`);
    return lineList.join("\n");
}

function attemptNote(attempt: ScoreAttempt, evaluation: Evaluation | null): string {
    const noteList: string[] = [];
    if (evaluation?.skipped) noteList.push(evaluation.reason ? `skipped ${evaluation.reason}` : "skipped");
    if (attempt.dedupFallback) noteList.push("dedup fallback");
    if ((evaluation?.errorCount ?? 0) > 0) noteList.push(`errors ${evaluation?.errorCount}`);
    return noteList.length > 0 ? noteList.join(", ") : "-";
}

function detailSection(summaryList: CaseSummary[], score: ScoreFile | null): string {
    const summary = score ? "Phase timing, token usage, and every scored attempt" : "Phase timing and token usage";
    const lineList = ["<details>", `<summary>${summary}</summary>`, "", "### Phase timing", ""];
    if (summaryList.length === 0) {
        lineList.push("No PR was recorded.");
    } else {
        lineList.push(
            table(
                ["PR", "Setup", "Plan", "Parallel review", "Writing", "Finalize"],
                summaryList.map((item) => [
                    item.caseId,
                    formatMs(item.medianTiming.setupMs ?? null),
                    formatMs(item.medianTiming.planMs ?? null),
                    formatMs(item.medianTiming.subWallMs ?? null),
                    formatMs(item.medianTiming.writingMs ?? null),
                    formatMs(item.medianTiming.finalizeMs ?? null),
                ]),
            ),
            "",
            "Preparation is outside review timing. Parallel review is wall time across the sub agent group.",
            "",
            "### Token usage",
            "",
            table(
                ["PR", "Input token", "Output token", "Cached input", "Successful request"],
                summaryList.map((item) => [
                    item.caseId,
                    formatToken(item.medianInputToken),
                    formatToken(item.medianOutputToken),
                    formatToken(item.medianCachedInputToken),
                    formatToken(item.medianRequestCount),
                ]),
            ),
            "",
            "Values are medians per completed attempt and include compression usage.",
        );
    }
    if (score) {
        const attemptList = [...(score.attemptList ?? [])].sort(
            (left, right) =>
                (left.caseId ?? "").localeCompare(right.caseId ?? "") ||
                (left.repeatIndex ?? 0) - (right.repeatIndex ?? 0) ||
                (left.attemptIndex ?? 0) - (right.attemptIndex ?? 0),
        );
        lineList.push(
            "",
            "### Every scored attempt",
            "",
            "Counts in this table are not filtered by profile.",
            "",
            attemptList.length === 0
                ? "None."
                : table(
                      ["PR", "Repeat", "Attempt", "Candidates", "Golden", "TP", "FP", "FN", "Precision", "Recall", "Note"],
                      attemptList.map((attempt) => {
                          const evaluation = usableEvaluation(attempt.evaluation);
                          return [
                              attempt.caseId ?? "-",
                              count(attempt.repeatIndex),
                              count(attempt.attemptIndex),
                              count(evaluation?.candidateCount),
                              count(evaluation?.goldenCount),
                              count(evaluation?.tp),
                              count(evaluation?.fp),
                              count(evaluation?.fn),
                              percent(evaluation?.candidatePrecision),
                              percent(evaluation?.candidateRecall),
                              attemptNote(attempt, evaluation),
                          ];
                      }),
                  ),
            "",
            "Match text and judge reasoning stay in `score.json`.",
        );
    }
    lineList.push("", "</details>");
    return lineList.join("\n");
}

function coreLabel(score: ScoreFile | null): { text: string; precision: string; recall: string; betaLabel: string } {
    const beta = finiteBeta(score?.beta);
    const core = score?.primary?.core;
    const label = betaLabel(beta);
    const text = percent(core?.fbeta);
    return {
        text: text === "-" || beta === null || beta === 2 ? text : `${text} ${label}`,
        precision: percent(core?.precision),
        recall: percent(core?.recall),
        betaLabel: label,
    };
}

async function loadIndexRow(resultRepoDir: string, batchId: string): Promise<IndexRow | null> {
    const batchDir = join(resultRepoDir, "result", batchId);
    const runPath = join(batchDir, "run.json");
    const resultPath = join(batchDir, "result.jsonl");
    if (!existsSync(runPath) || !existsSync(resultPath)) return null;
    const run = loadRun(await readFile(runPath, "utf-8"));
    const recordList = loadResultList(await readFile(resultPath, "utf-8"));
    const completedList = recordList.filter((record) => record.status === "completed");
    const reviewMsList = completedList
        .map((record) => record.timing?.reviewMs)
        .filter((value): value is number => typeof value === "number");
    const scorePath = join(batchDir, "score.json");
    const score = existsSync(scorePath) ? loadScore(await readFile(scorePath, "utf-8")) : null;
    const core = coreLabel(score);
    return {
        batchId,
        startedAt: run.startedAt ?? "-",
        startedLabel: formatWhen(run.startedAt),
        profileName: run.profileName ?? "-",
        model: formatModel(run),
        code: formatCode(run),
        completed: recordList.length ? `${completedList.length} / ${recordList.length}` : "-",
        medianReview: formatMs(median(reviewMsList)),
        coreScore: core.text,
        precision: core.precision,
        recall: core.recall,
        betaLabel: core.betaLabel,
    };
}

function runTable(rowList: IndexRow[]): string {
    return table(
        ["Batch", "Started", "Profile", "Model", "Code", "Completed", "Median", "Core score"],
        rowList.map((row) => [
            `[${row.batchId}](result/${row.batchId}/)`,
            row.startedLabel,
            row.profileName,
            row.model,
            row.code,
            row.completed,
            row.medianReview,
            row.coreScore,
        ]),
    );
}

function latestFull(row: IndexRow): string {
    return [
        "## Latest full",
        "",
        factTable([
            ["Batch", `[${row.batchId}](result/${row.batchId}/)`],
            ["Model", row.model],
            ["Started", row.startedLabel],
            ["Code", row.code],
            ["Completed", row.completed],
            ["Median review", row.medianReview],
            [`Core ${row.betaLabel}`, row.coreScore],
            ["Precision", row.precision],
            ["Recall", row.recall],
        ]),
    ].join("\n");
}

export async function buildRootReadme(resultRepoDir: string): Promise<string> {
    const resultDir = join(resultRepoDir, "result");
    if (!existsSync(resultDir)) return `${INTRO}\n\nNo published batch yet.\n`;
    const entryList = await readdir(resultDir, { withFileTypes: true });
    const rowList: IndexRow[] = [];
    for (const entry of entryList) {
        if (!entry.isDirectory()) continue;
        const row = await loadIndexRow(resultRepoDir, entry.name);
        if (row) rowList.push(row);
    }
    rowList.sort((left, right) => {
        if (left.startedAt === right.startedAt) return left.batchId.localeCompare(right.batchId);
        if (left.startedAt === "-") return 1;
        if (right.startedAt === "-") return -1;
        return right.startedAt.localeCompare(left.startedAt);
    });
    if (rowList.length === 0) return `${INTRO}\n\nNo published batch yet.\n`;
    const lineList = [INTRO, ""];
    const full = rowList.find((row) => row.profileName === "full");
    if (full) lineList.push(latestFull(full), "");
    lineList.push("## Runs", "", runTable(rowList), "");
    return lineList.join("\n");
}
