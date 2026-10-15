import { readFile, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { OUTPUT_DIR } from "./git.js";
import type { AttemptStatus, PhaseTiming, SenderStat, SubAgentMeasure } from "./measure.js";

export type AttemptRecord = {
    runId: string;
    caseId: string;
    project?: string;
    repeatIndex: number;
    attemptIndex: number;
    status: AttemptStatus;
    statusReason?: string | null;
    timing?: PhaseTiming;
    tokenUsage?: { inputToken: number; outputToken: number; cachedInputToken: number } | null;
    sender?: Partial<SenderStat> | null;
    reviewUnitCount?: number | null;
    subAgentList?: SubAgentMeasure[];
    changedFileCount?: number;
    addedLineCount?: number;
    deletedLineCount?: number;
    postedCommentCount?: number | null;
    postedInlineCount?: number | null;
    coverageMissList?: string[];
    startedAt?: string;
    finishedAt?: string | null;
    repro?: { manifestHash?: string };
};

type CaseInfo = Pick<AttemptRecord, "caseId" | "project" | "addedLineCount" | "deletedLineCount" | "changedFileCount">;

type BatchMeta = {
    profileName?: string;
    repeatCount?: number;
    caseIdList?: string[];
    caseInfoList?: CaseInfo[];
    modelName?: string;
    modelProvider?: string;
    startedAt?: string;
    machineDescription?: string;
    provalCommit?: string;
    isDirty?: boolean;
    manifestHash?: string;
};

const reportTemplate = readFileSync(join(import.meta.dir, "templates", "report.template.md"), "utf-8");
const compareTemplate = readFileSync(join(import.meta.dir, "templates", "compare.template.md"), "utf-8");

export type SizeBucket = "S" | "M" | "L" | "XL" | "BZ" | "unknown";

function isKnownCount(value: number | undefined): value is number {
    return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

/** BZ holds binary only or zero text change cases, never filled by duplicating cases. */
export function sizeBucket(addedLineCount?: number, deletedLineCount?: number): SizeBucket {
    if (!isKnownCount(addedLineCount) || !isKnownCount(deletedLineCount)) return "unknown";
    const total = addedLineCount + deletedLineCount;
    if (total === 0) return "BZ";
    if (total <= 100) return "S";
    if (total <= 500) return "M";
    if (total <= 2000) return "L";
    return "XL";
}

export function median(valueList: number[]): number | null {
    if (valueList.length === 0) return null;
    const sorted = [...valueList].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export type CaseSummary = {
    caseId: string;
    project: string;
    bucket: SizeBucket;
    changedFileCount: number | null;
    changedLineCount: number | null;
    attemptCount: number;
    statusCount: Record<string, number>;
    completedMsList: number[];
    medianReviewMs: number | null;
    minReviewMs: number | null;
    maxReviewMs: number | null;
    medianTiming: Partial<PhaseTiming>;
    medianInputToken: number | null;
    medianOutputToken: number | null;
    medianCachedInputToken: number | null;
    medianRequestCount: number | null;
    medianReviewUnitCount: number | null;
    medianOutputCount: number | null;
};

function countByStatus(recordList: AttemptRecord[]): Record<string, number> {
    const statusCount: Record<string, number> = {};
    for (const record of recordList) {
        statusCount[record.status] = (statusCount[record.status] ?? 0) + 1;
    }
    return statusCount;
}

function medianOf(
    recordList: AttemptRecord[],
    pick: (record: AttemptRecord) => number | null | undefined,
): number | null {
    return median(recordList.map(pick).filter((value): value is number => typeof value === "number"));
}

function summarizeCaseInfo(
    recordList: CaseInfo[],
): Pick<CaseSummary, "project" | "bucket" | "changedFileCount" | "changedLineCount"> {
    const sizeRecord = recordList.find(
        (record) => sizeBucket(record.addedLineCount, record.deletedLineCount) !== "unknown",
    );
    return {
        project: recordList.find((record) => record.project?.trim())?.project ?? "unknown",
        bucket: sizeBucket(sizeRecord?.addedLineCount, sizeRecord?.deletedLineCount),
        changedFileCount: recordList.find((record) => isKnownCount(record.changedFileCount))?.changedFileCount ?? null,
        changedLineCount: sizeRecord ? (sizeRecord.addedLineCount ?? 0) + (sizeRecord.deletedLineCount ?? 0) : null,
    };
}

export function summarizeCase(recordList: AttemptRecord[], caseInfo?: CaseInfo): CaseSummary {
    const caseId = caseInfo?.caseId ?? recordList[0]?.caseId;
    if (!caseId) throw new Error("Cannot summarize a case without an identifier");
    const completedList = recordList.filter((record) => record.status === "completed");
    const completedMsList = completedList
        .map((record) => record.timing?.reviewMs)
        .filter((value): value is number => typeof value === "number");
    const medianTiming: Partial<PhaseTiming> = {};
    for (const key of ["setupMs", "planMs", "subWallMs", "writingMs", "finalizeMs"] as const) {
        const value = medianOf(completedList, (record) => record.timing?.[key]);
        if (value !== null) medianTiming[key] = value;
    }
    return {
        caseId,
        ...summarizeCaseInfo(caseInfo ? [caseInfo, ...recordList] : recordList),
        attemptCount: recordList.length,
        statusCount: countByStatus(recordList),
        completedMsList,
        medianReviewMs: median(completedMsList),
        minReviewMs: completedMsList.length ? Math.min(...completedMsList) : null,
        maxReviewMs: completedMsList.length ? Math.max(...completedMsList) : null,
        medianTiming,
        medianInputToken: medianOf(
            completedList,
            (record) => record.sender?.inputToken ?? record.tokenUsage?.inputToken,
        ),
        medianOutputToken: medianOf(
            completedList,
            (record) => record.sender?.outputToken ?? record.tokenUsage?.outputToken,
        ),
        medianCachedInputToken: medianOf(
            completedList,
            (record) => record.sender?.cachedInputToken ?? record.tokenUsage?.cachedInputToken,
        ),
        medianRequestCount: medianOf(completedList, (record) => record.sender?.requestCount),
        medianReviewUnitCount: medianOf(completedList, (record) => record.reviewUnitCount),
        medianOutputCount: medianOf(completedList, (record) =>
            typeof record.postedCommentCount === "number" && typeof record.postedInlineCount === "number"
                ? record.postedCommentCount + record.postedInlineCount
                : null,
        ),
    };
}

export function summarizeBatch(recordList: AttemptRecord[], caseInfoList: CaseInfo[] = []): CaseSummary[] {
    const caseInfoById = new Map(caseInfoList.map((info) => [info.caseId, info]));
    const byCaseMap = new Map<string, AttemptRecord[]>(caseInfoList.map((info) => [info.caseId, []]));
    for (const record of recordList) {
        const list = byCaseMap.get(record.caseId) ?? [];
        list.push(record);
        byCaseMap.set(record.caseId, list);
    }
    return [...byCaseMap.entries()]
        .map(([caseId, list]) => summarizeCase(list, caseInfoById.get(caseId)))
        .sort((a, b) => (a.caseId < b.caseId ? -1 : a.caseId > b.caseId ? 1 : 0));
}

export type GroupSummary = {
    project: string;
    bucket: SizeBucket;
    caseCount: number;
    completedCaseCount: number;
    statusCount: Record<string, number>;
    medianChangedFileCount: number | null;
    medianOfCaseMedianMs: number | null;
    minCaseMedianMs: number | null;
    maxCaseMedianMs: number | null;
};

export function summarizeGroupList(caseSummaryList: CaseSummary[]): GroupSummary[] {
    const byGroupMap = new Map<string, CaseSummary[]>();
    for (const summary of caseSummaryList) {
        const key = `${summary.project}|${summary.bucket}`;
        const list = byGroupMap.get(key) ?? [];
        list.push(summary);
        byGroupMap.set(key, list);
    }
    const groupList: GroupSummary[] = [];
    for (const [key, list] of byGroupMap) {
        const [project, bucket] = key.split("|") as [string, SizeBucket];
        const caseMedianList = list
            .map((summary) => summary.medianReviewMs)
            .filter((value): value is number => typeof value === "number");
        const statusCount: Record<string, number> = {};
        for (const summary of list) {
            for (const [status, count] of Object.entries(summary.statusCount)) {
                statusCount[status] = (statusCount[status] ?? 0) + count;
            }
        }
        groupList.push({
            project,
            bucket,
            caseCount: list.length,
            completedCaseCount: list.filter((summary) => summary.medianReviewMs !== null).length,
            statusCount,
            medianChangedFileCount: median(
                list.map((summary) => summary.changedFileCount).filter((value): value is number => value !== null),
            ),
            medianOfCaseMedianMs: median(caseMedianList),
            minCaseMedianMs: caseMedianList.length ? Math.min(...caseMedianList) : null,
            maxCaseMedianMs: caseMedianList.length ? Math.max(...caseMedianList) : null,
        });
    }
    return groupList.sort((a, b) =>
        a.project === b.project ? (a.bucket < b.bucket ? -1 : 1) : a.project < b.project ? -1 : 1,
    );
}

export type CompareRow = {
    caseId: string;
    project: string;
    bucket: SizeBucket;
    pairCount: number;
    baselineMedianMs: number;
    candidateMedianMs: number;
    relativeChange: number;
};

export type CompareResult = {
    rowList: CompareRow[];
    /** Cases without enough completed pairs, kept visible instead of dropped silently. */
    unpairedList: { caseId: string; baselineStatus: Record<string, number>; candidateStatus: Record<string, number> }[];
    regressionList: { caseId: string; status: Record<string, number>; side: "baseline" | "candidate" }[];
    medianRelativeChange: number | null;
};

function assertSameManifest(hashList: unknown[]): void {
    if (hashList.some((hash) => typeof hash !== "string" || hash.trim().length === 0)) {
        throw new Error("Cannot compare because manifest identity is missing. Run a new batch with a frozen manifest.");
    }
    if (new Set(hashList).size > 1) {
        throw new Error("Cannot compare because the frozen manifest differs. Use batch input from the same manifest.");
    }
}

function comparisonManifestHashList(recordList: AttemptRecord[]): (string | undefined)[] {
    // An interrupted start event can lack repro data and contributes no timing.
    return recordList
        .filter((record) => record.status === "completed" || record.repro !== undefined)
        .map((record) => record.repro?.manifestHash);
}

/** Pair completed attempts only after checking frozen input identity. */
export function compareBatch(baselineList: AttemptRecord[], candidateList: AttemptRecord[]): CompareResult {
    assertSameManifest(comparisonManifestHashList([...baselineList, ...candidateList]));
    const caseIdSet = new Set([...baselineList.map((r) => r.caseId), ...candidateList.map((r) => r.caseId)]);
    const rowList: CompareRow[] = [];
    const unpairedList: CompareResult["unpairedList"] = [];
    const regressionList: CompareResult["regressionList"] = [];

    for (const caseId of [...caseIdSet].sort()) {
        const baseCaseList = baselineList.filter((record) => record.caseId === caseId);
        const candCaseList = candidateList.filter((record) => record.caseId === caseId);
        const pairMsList: { base: number; cand: number }[] = [];
        const repeatSet = new Set([
            ...baseCaseList.map((record) => record.repeatIndex),
            ...candCaseList.map((record) => record.repeatIndex),
        ]);
        for (const repeatIndex of repeatSet) {
            const base = baseCaseList.find(
                (record) => record.repeatIndex === repeatIndex && record.status === "completed",
            );
            const cand = candCaseList.find(
                (record) => record.repeatIndex === repeatIndex && record.status === "completed",
            );
            const baseMs = base?.timing?.reviewMs;
            const candMs = cand?.timing?.reviewMs;
            if (typeof baseMs === "number" && typeof candMs === "number") {
                pairMsList.push({ base: baseMs, cand: candMs });
            }
        }
        const caseInfo = summarizeCaseInfo([...candCaseList, ...baseCaseList]);
        for (const [side, list] of [
            ["baseline", baseCaseList],
            ["candidate", candCaseList],
        ] as const) {
            const badList = list.filter((record) => record.status !== "completed");
            if (badList.length > 0) {
                regressionList.push({ caseId, status: countByStatus(badList), side });
            }
        }
        if (pairMsList.length === 0) {
            unpairedList.push({
                caseId,
                baselineStatus: countByStatus(baseCaseList),
                candidateStatus: countByStatus(candCaseList),
            });
            continue;
        }
        const baselineMedianMs = median(pairMsList.map((pair) => pair.base))!;
        const candidateMedianMs = median(pairMsList.map((pair) => pair.cand))!;
        rowList.push({
            caseId,
            project: caseInfo.project,
            bucket: caseInfo.bucket,
            pairCount: pairMsList.length,
            baselineMedianMs,
            candidateMedianMs,
            relativeChange: baselineMedianMs === 0 ? 0 : (candidateMedianMs - baselineMedianMs) / baselineMedianMs,
        });
    }

    return {
        rowList,
        unpairedList,
        regressionList,
        medianRelativeChange: median(rowList.map((row) => row.relativeChange)),
    };
}

function formatMs(value: number | null): string {
    if (value === null) return "-";
    if (value < 1000) return `${Math.round(value)} ms`;
    if (value >= 60_000) return `${(value / 60_000).toFixed(1)} min`;
    return `${(value / 1000).toFixed(1)} s`;
}

function formatCount(value: number | null): string {
    return value === null ? "-" : Math.round(value).toLocaleString("en-US");
}

const statusLabel: Record<string, string> = {
    completed: "Completed",
    incomplete: "Incomplete",
    failed: "Failed",
    prepareFailed: "Preparation failed",
    canceled: "Canceled",
    interrupted: "Interrupted",
};

function formatStatus(statusCount: Record<string, number>): string {
    return (
        Object.entries(statusCount)
            .sort(([a], [b]) => (a < b ? -1 : 1))
            .map(([status, count]) => `${statusLabel[status] ?? status} ${count}`)
            .join(", ") || "No recorded attempt"
    );
}

function markdownText(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/[\\`*_[\]{}!#|]/g, "\\$&")
        .replace(/\r\n|\r|\n/g, " ");
}

function renderTable(headerList: string[], rowList: string[][]): string {
    if (rowList.length === 0) return "None.";
    const line = (cellList: string[]) => `| ${cellList.map(markdownText).join(" | ")} |`;
    return [line(headerList), line(headerList.map(() => "---")), ...rowList.map(line)].join("\n");
}

function fillTemplate(template: string, valueByName: Record<string, string>): string {
    return template
        .replace(/\{\{(\w+)\}\}/g, (_match, name: string) => {
            if (!Object.hasOwn(valueByName, name)) throw new Error(`Missing report template value ${name}`);
            return valueByName[name] ?? "";
        })
        .trim();
}

export function renderReportText(batchId: string, recordList: AttemptRecord[], meta: BatchMeta = {}): string {
    const caseInfoById = new Map((meta.caseInfoList ?? []).map((info) => [info.caseId, info]));
    const planCaseIdList = meta.caseIdList ?? [...caseInfoById.keys()];
    const caseSummaryList = summarizeBatch(
        recordList,
        planCaseIdList.map((caseId) => caseInfoById.get(caseId) ?? { caseId }),
    );
    const groupList = summarizeGroupList(caseSummaryList);
    const repeatCount = meta.repeatCount;
    const hasPlan = isKnownCount(repeatCount) && repeatCount > 0 && planCaseIdList.length > 0;
    const awaitingByCase = new Map<string, number>();
    if (hasPlan) {
        for (const caseId of planCaseIdList) {
            const endedRepeatSet = new Set(
                recordList
                    .filter(
                        (record) =>
                            record.caseId === caseId &&
                            Number.isInteger(record.repeatIndex) &&
                            record.repeatIndex >= 1 &&
                            record.repeatIndex <= repeatCount,
                    )
                    .map((record) => record.repeatIndex),
            );
            awaitingByCase.set(caseId, repeatCount - endedRepeatSet.size);
        }
    }
    const statusCount = countByStatus(recordList);
    const reasonLabel: Record<string, string> = {
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
    return fillTemplate(reportTemplate, {
        runTable: renderTable(
            ["Run", "Value"],
            [
                ["Batch", batchId],
                ["Profile", meta.profileName ?? "-"],
                ["Model", [meta.modelProvider, meta.modelName].filter(Boolean).join(" / ") || "-"],
                ["Started", meta.startedAt ?? "-"],
                ["Machine", meta.machineDescription ?? "-"],
                [
                    "Code",
                    meta.provalCommit
                        ? `${meta.provalCommit.slice(0, 12)}${meta.isDirty ? " with local changes" : ""}`
                        : "-",
                ],
            ],
        ),
        progressTable: renderTable(
            ["Planned review", "Recorded attempt", "Completed attempt", "Awaiting result"],
            [
                [
                    formatCount(hasPlan ? planCaseIdList.length * repeatCount : null),
                    formatCount(recordList.length),
                    formatCount(statusCount.completed ?? 0),
                    formatCount(hasPlan ? [...awaitingByCase.values()].reduce((sum, count) => sum + count, 0) : null),
                ],
            ],
        ),
        statusTable: renderTable(
            ["Outcome", "Attempt count"],
            Object.entries(statusCount).map(([status, count]) => [statusLabel[status] ?? status, formatCount(count)]),
        ),
        groupTable: renderTable(
            ["Project", "Size", "PR count", "With success", "Median review", "Range"],
            groupList.map((group) => [
                group.project,
                group.bucket,
                String(group.caseCount),
                String(group.completedCaseCount),
                formatMs(group.medianOfCaseMedianMs),
                group.minCaseMedianMs === null
                    ? "-"
                    : `${formatMs(group.minCaseMedianMs)} to ${formatMs(group.maxCaseMedianMs)}`,
            ]),
        ),
        caseTable: renderTable(
            ["PR", "Size", "Changed line", "File", "Outcome", "Median review", "Range"],
            caseSummaryList.map((summary) => {
                const awaiting = awaitingByCase.get(summary.caseId) ?? 0;
                const outcome =
                    [
                        summary.attemptCount ? formatStatus(summary.statusCount) : "",
                        awaiting ? `Awaiting result ${awaiting}` : "",
                    ]
                        .filter(Boolean)
                        .join(", ") || "No recorded attempt";
                return [
                    summary.caseId,
                    summary.bucket,
                    formatCount(summary.changedLineCount),
                    formatCount(summary.changedFileCount),
                    outcome,
                    formatMs(summary.medianReviewMs),
                    summary.minReviewMs === null
                        ? "-"
                        : `${formatMs(summary.minReviewMs)} to ${formatMs(summary.maxReviewMs)}`,
                ];
            }),
        ),
        phaseTable: renderTable(
            ["PR", "Setup", "Plan", "Parallel review", "Writing", "Finalize"],
            caseSummaryList.map((summary) => [
                summary.caseId,
                ...(["setupMs", "planMs", "subWallMs", "writingMs", "finalizeMs"] as const).map((key) =>
                    formatMs(summary.medianTiming[key] ?? null),
                ),
            ]),
        ),
        tokenTable: renderTable(
            ["PR", "Input token", "Output token", "Cached input", "Successful request"],
            caseSummaryList.map((summary) => [
                summary.caseId,
                formatCount(summary.medianInputToken),
                formatCount(summary.medianOutputToken),
                formatCount(summary.medianCachedInputToken),
                formatCount(summary.medianRequestCount),
            ]),
        ),
        issueTable: renderTable(
            ["PR", "Repeat", "Attempt", "Status", "Review elapsed", "Reason"],
            recordList
                .filter((record) => record.status !== "completed")
                .map((record) => [
                    record.caseId,
                    String(record.repeatIndex),
                    String(record.attemptIndex),
                    statusLabel[record.status] ?? record.status,
                    formatMs(record.timing?.reviewMs ?? null),
                    reasonLabel[record.statusReason ?? ""] ?? record.statusReason ?? "-",
                ]),
        ),
    });
}

export function renderCompareText(baselineId: string, candidateId: string, result: CompareResult): string {
    return fillTemplate(compareTemplate, {
        runTable: renderTable(
            ["Role", "Batch"],
            [
                ["Baseline", baselineId],
                ["Candidate", candidateId],
            ],
        ),
        summary:
            result.rowList.length === 0
                ? "No completed PR pair to compare."
                : `${result.rowList.length} paired PRs. Median change ${result.medianRelativeChange === null ? "-" : `${(result.medianRelativeChange * 100).toFixed(1)}%`}.`,
        comparisonTable: renderTable(
            ["PR", "Size", "Pair count", "Baseline", "Candidate", "Change"],
            result.rowList.map((row) => [
                row.caseId,
                row.bucket,
                String(row.pairCount),
                formatMs(row.baselineMedianMs),
                formatMs(row.candidateMedianMs),
                `${(row.relativeChange * 100).toFixed(1)}%`,
            ]),
        ),
        issueTable: renderTable(
            ["PR", "Side", "Outcome"],
            result.regressionList.map((item) => [item.caseId, item.side, formatStatus(item.status)]),
        ),
        unpairedTable: renderTable(
            ["PR", "Baseline", "Candidate"],
            result.unpairedList.map((item) => [
                item.caseId,
                formatStatus(item.baselineStatus),
                formatStatus(item.candidateStatus),
            ]),
        ),
    });
}

async function loadBatchData(batchId: string): Promise<{ meta: BatchMeta; recordList: AttemptRecord[] }> {
    const batchDir = join(OUTPUT_DIR, batchId);
    const readOptional = (name: string, fallback: string) =>
        readFile(join(batchDir, name), "utf-8").catch((error: NodeJS.ErrnoException) => {
            if (error.code === "ENOENT") return fallback;
            throw error;
        });
    const [content, metaContent] = await Promise.all([
        readOptional("result.jsonl", ""),
        readOptional("run.json", "{}"),
    ]);
    const meta = JSON.parse(metaContent) as BatchMeta;
    const caseInfoById = new Map((meta.caseInfoList ?? []).map((info) => [info.caseId, info]));
    const recordList = content
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as AttemptRecord & { type: string })
        .filter((line) => line.type === "result")
        .map((record) => {
            const info = caseInfoById.get(record.caseId);
            if (!info) return record;
            return {
                ...record,
                project: info.project,
                addedLineCount: info.addedLineCount,
                deletedLineCount: info.deletedLineCount,
                changedFileCount: info.changedFileCount,
            };
        });
    return { meta, recordList };
}

export async function loadBatchRecordList(batchId: string): Promise<AttemptRecord[]> {
    return (await loadBatchData(batchId)).recordList;
}

export async function reportBatch(batchId: string): Promise<string> {
    const { meta, recordList } = await loadBatchData(batchId);
    const text = renderReportText(batchId, recordList, meta);
    await writeFile(join(OUTPUT_DIR, batchId, "report.md"), `${text}\n`);
    return text;
}

export async function compareBatchById(baselineId: string, candidateId: string): Promise<string> {
    const [baseline, candidate] = await Promise.all([loadBatchData(baselineId), loadBatchData(candidateId)]);
    assertSameManifest([
        baseline.meta.manifestHash,
        candidate.meta.manifestHash,
        ...comparisonManifestHashList([...baseline.recordList, ...candidate.recordList]),
    ]);
    const text = renderCompareText(baselineId, candidateId, compareBatch(baseline.recordList, candidate.recordList));
    await writeFile(join(OUTPUT_DIR, candidateId, `compare-${baselineId}.md`), `${text}\n`);
    return text;
}
