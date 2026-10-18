import type { SenderConfig } from "../src/agent/llm/factory.js";
import type { ReviewMeasureEvent } from "../src/agent/pull-request/index.js";

export type ManifestCase = {
    caseId: string;
    project: string;
    sourceUrl: string;
    repoUrl: string;
    prNumber: number;
    title: string;
    body: string;
    baseSha: string;
    startSha: string;
    headSha: string;
    addedLineCount: number;
    deletedLineCount: number;
    changedFileCount: number;
    binaryFileCount: number;
    diffHash: string;
};

export type ManifestUnavailable = {
    sourceUrl: string;
    reason: string;
};

export type Manifest = {
    schemaVersion: number;
    datasetCommit: string;
    importedAt: string;
    caseList: ManifestCase[];
    unavailableList: ManifestUnavailable[];
};

export type BenchmarkLlmConfig = Pick<SenderConfig, "provider" | "baseURL" | "apiKey" | "model">;

export type BenchmarkProfileSetting = {
    language: string;
    inlineReview: boolean;
    userPrompt: string;
    reasoningEffort: string | null;
    llmConcurrency: number | null;
    timeoutSecond: number;
};

export type BenchmarkRunProfile = {
    repeatCount: number;
    seed: number;
    /** null means every manifest case. */
    caseIdList: string[] | null;
};

export type BenchmarkProfile = {
    schemaVersion: number;
    setting: BenchmarkProfileSetting;
    quick: BenchmarkRunProfile;
    full: BenchmarkRunProfile;
};

export type SourceState = {
    provalCommit: string;
    isDirty: boolean;
    sourceStateHash: string;
};

export const ATTEMPT_STATUS_LIST = [
    "completed",
    "incomplete",
    "failed",
    "prepareFailed",
    "canceled",
    "interrupted",
] as const;

export type AttemptStatus = (typeof ATTEMPT_STATUS_LIST)[number];

export type PhaseName = "setup" | "plan" | "sub" | "writing" | "finalize";

export type PhaseTiming = {
    prepareMs: number | null;
    reviewMs: number | null;
    setupMs: number | null;
    planMs: number | null;
    subWallMs: number | null;
    writingMs: number | null;
    finalizeMs: number | null;
};

export type SubAgentMeasure = {
    index: number;
    durationMs: number | null;
    ok: boolean | null;
    fileCount: number;
    stepCount: number | null;
    toolCallCount: number | null;
    inputToken: number | null;
    outputToken: number | null;
    cachedInputToken: number | null;
};

export type SenderStat = {
    requestCount: number;
    retryCount: number;
    compressionCount: number;
    inputToken: number;
    outputToken: number;
    cachedInputToken: number;
    /** Sum of per request wall time. Requests overlap, so this can exceed reviewMs. */
    requestMsSum: number;
    /** The wrapper sits outside the concurrency limiter, so request timing includes queue wait. */
    includesConcurrencyWait: true;
};

export type TimedEvent = { at: number; event: ReviewMeasureEvent };

export type ResultLine = {
    type: "start" | "result";
    runId: string;
    caseId: string;
    repeatIndex: number;
    attemptIndex: number;
    status?: AttemptStatus;
    [key: string]: unknown;
};

export type RunOptions = {
    profileName: "quick" | "full";
    batchId?: string;
    resume: boolean;
    /** Restrict the batch to a subset of profile cases. */
    caseIdList?: string[];
};

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

export type SizeBucket = "S" | "M" | "L" | "XL" | "BZ" | "unknown";

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
