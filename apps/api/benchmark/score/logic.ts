import { DEDUP_PROMPT, EXTRACT_PROMPT, JUDGE_PROMPT, formatPrompt } from "./prompt.js";

export type GoldenComment = {
    comment: string;
    severity?: string;
    category?: string;
};

export type ProfileName = "strict" | "core" | "all";

export const PROFILE_NAME_LIST = ["strict", "core", "all"] as const;

export const PROFILE_CATEGORY: Record<ProfileName, ReadonlySet<string>> = {
    strict: new Set(["bug", "security", "concurrency", "data", "api"]),
    core: new Set(["bug", "security", "concurrency", "data", "api", "perf", "test_gap", "doc_defect"]),
    all: new Set([
        "bug",
        "security",
        "concurrency",
        "data",
        "api",
        "perf",
        "test_gap",
        "doc_defect",
        "style",
        "speculative",
    ]),
};

export type MatchResult = {
    match?: boolean;
    confidence?: number;
    reasoning?: string;
    error?: string;
};

export type TruePositive = {
    goldenComment: string;
    severity?: string;
    category?: string;
    matchedCandidate: string;
    confidence: number;
    reasoning?: string;
};

export type FalseNegative = {
    goldenComment: string;
    severity?: string;
    category?: string;
};

export type Evaluation = {
    skipped: boolean;
    reason?: string;
    truePositiveList: TruePositive[];
    falsePositiveList: { candidate: string }[];
    falseNegativeList: FalseNegative[];
    errorList: { golden: string; candidate: string; error: string }[];
    candidateCount: number;
    goldenCount: number;
    tp: number;
    fp: number;
    fn: number;
    errorCount: number;
    /** Martian step3 field. Matched golden count divided by candidate count. */
    candidatePrecision: number;
    candidateRecall: number;
};

export type ProfileScore = {
    precision: number;
    recall: number;
    f1: number;
    fbeta: number;
    tp: number;
    fp: number;
    fn: number;
    attemptCount: number;
};

/** Scored text is inline findings only. Summary comments restate them and append Additional Notes. */
export function joinInlineBody(postedList: { type?: string; body?: string }[]): string {
    return postedList
        .filter((item) => item.type === "inline" && item.body)
        .map((item) => item.body as string)
        .join("\n\n---\n\n");
}

export function parseModelJson(content: string): unknown {
    let text = content.trim();
    if (text.startsWith("```")) {
        const partList = text.split("```");
        text = partList[1] ?? text;
        if (text.startsWith("json")) text = text.slice(4);
        text = text.trim();
    }
    return JSON.parse(text);
}

export function parseExtractIssueList(content: string): { issueList: string[]; error?: string } {
    let parsed: unknown;
    try {
        parsed = parseModelJson(content);
    } catch (error) {
        return { issueList: [], error: error instanceof Error ? error.message : String(error) };
    }
    if (!parsed || typeof parsed !== "object" || !("issues" in parsed)) {
        return { issueList: [], error: "Missing issues key" };
    }
    const issueList = (parsed as { issues: unknown }).issues;
    if (!Array.isArray(issueList) || issueList.some((item) => typeof item !== "string")) {
        return { issueList: [], error: "issues must be a string list" };
    }
    return { issueList };
}

/** Returns null when the model response is not a partition of 0..n-1. */
export function parseDedupGroupList(content: string, candidateCount: number): number[][] | null {
    let parsed: unknown;
    try {
        parsed = parseModelJson(content);
    } catch {
        return null;
    }
    if (!parsed || typeof parsed !== "object" || !("groups" in parsed)) return null;
    const groupList = (parsed as { groups: unknown }).groups;
    if (!Array.isArray(groupList)) return null;
    const seen = new Set<number>();
    const parsedGroupList: number[][] = [];
    for (const group of groupList) {
        if (!Array.isArray(group)) return null;
        const indexList: number[] = [];
        for (const index of group) {
            if (!Number.isInteger(index) || index < 0 || index >= candidateCount || seen.has(index)) return null;
            seen.add(index);
            indexList.push(index);
        }
        parsedGroupList.push(indexList);
    }
    if (seen.size !== candidateCount) return null;
    return parsedGroupList;
}

export function extractPrompt(comment: string): string {
    return formatPrompt(EXTRACT_PROMPT, { comment });
}

export function dedupPrompt(candidateList: string[]): string {
    const numbered = candidateList.map((text, index) => `${index}. ${text}`).join("\n");
    return formatPrompt(DEDUP_PROMPT, { candidates: numbered });
}

export function judgePrompt(goldenComment: string, candidate: string): string {
    return formatPrompt(JUDGE_PROMPT, { golden_comment: goldenComment, candidate });
}

function siblingMap(candidateList: string[], groupList: number[][] | null): Map<string, Set<string>> {
    const map = new Map<string, Set<string>>();
    if (!groupList) return map;
    for (const group of groupList) {
        const textSet = new Set(
            group.filter((index) => index < candidateList.length).map((index) => candidateList[index]),
        );
        for (const index of group) {
            if (index >= candidateList.length) continue;
            const text = candidateList[index];
            const siblingSet = new Set(textSet);
            siblingSet.delete(text);
            map.set(text, siblingSet);
        }
    }
    return map;
}

export function evaluateReview(
    goldenCommentList: GoldenComment[],
    candidateList: string[],
    matchResultList: MatchResult[],
    dedupGroupList: number[][] | null,
): Evaluation {
    if (goldenCommentList.length === 0) {
        return emptyEvaluation(0, 0, true, "No golden comments");
    }
    if (candidateList.length === 0) {
        return {
            ...emptyEvaluation(0, goldenCommentList.length, false),
            falseNegativeList: goldenCommentList.map(toFalseNegative),
            fn: goldenCommentList.length,
        };
    }
    if (matchResultList.length !== goldenCommentList.length * candidateList.length) {
        throw new Error("match result count does not match golden and candidate pairs");
    }

    const goldenMatched = new Map<
        string,
        {
            severity?: string;
            category?: string;
            matched: boolean;
            bestConfidence: number;
            matchedCandidate: string | null;
            reasoning?: string;
        }
    >();
    for (const golden of goldenCommentList) {
        goldenMatched.set(golden.comment, {
            severity: golden.severity,
            category: golden.category,
            matched: false,
            bestConfidence: 0,
            matchedCandidate: null,
        });
    }
    const candidateMatched = new Map(candidateList.map((candidate) => [candidate, false]));
    const siblingByCandidate = siblingMap(candidateList, dedupGroupList);
    const errorList: Evaluation["errorList"] = [];
    let pairIndex = 0;
    for (const golden of goldenCommentList) {
        for (const candidate of candidateList) {
            const result = matchResultList[pairIndex];
            pairIndex++;
            if (result.error) {
                errorList.push({ golden: golden.comment, candidate, error: result.error });
                continue;
            }
            const confidence = result.confidence ?? 0;
            const current = goldenMatched.get(golden.comment);
            if (!current) continue;
            if (result.match && confidence > current.bestConfidence) {
                current.matched = true;
                current.bestConfidence = confidence;
                current.matchedCandidate = candidate;
                current.reasoning = result.reasoning;
                candidateMatched.set(candidate, true);
                for (const sibling of siblingByCandidate.get(candidate) ?? []) {
                    candidateMatched.set(sibling, true);
                }
            }
        }
    }

    const truePositiveList: TruePositive[] = [];
    const falseNegativeList: FalseNegative[] = [];
    for (const [goldenComment, info] of goldenMatched) {
        if (info.matched && info.matchedCandidate) {
            truePositiveList.push({
                goldenComment,
                severity: info.severity,
                category: info.category,
                matchedCandidate: info.matchedCandidate,
                confidence: info.bestConfidence,
                reasoning: info.reasoning,
            });
        } else {
            falseNegativeList.push({
                goldenComment,
                severity: info.severity,
                category: info.category,
            });
        }
    }
    const falsePositiveList = [...candidateMatched.entries()]
        .filter(([, matched]) => !matched)
        .map(([candidate]) => ({ candidate }));
    const tp = truePositiveList.length;
    return {
        skipped: false,
        truePositiveList,
        falsePositiveList,
        falseNegativeList,
        errorList,
        candidateCount: candidateList.length,
        goldenCount: goldenCommentList.length,
        tp,
        fp: falsePositiveList.length,
        fn: falseNegativeList.length,
        errorCount: errorList.length,
        candidatePrecision: candidateList.length === 0 ? 0 : tp / candidateList.length,
        candidateRecall: goldenCommentList.length === 0 ? 0 : tp / goldenCommentList.length,
    };
}

function toFalseNegative(golden: GoldenComment): FalseNegative {
    return { goldenComment: golden.comment, severity: golden.severity, category: golden.category };
}

function emptyEvaluation(candidateCount: number, goldenCount: number, skipped: boolean, reason?: string): Evaluation {
    return {
        skipped,
        reason,
        truePositiveList: [],
        falsePositiveList: [],
        falseNegativeList: [],
        errorList: [],
        candidateCount,
        goldenCount,
        tp: 0,
        fp: 0,
        fn: 0,
        errorCount: 0,
        candidatePrecision: 0,
        candidateRecall: 0,
    };
}

export function fbeta(precision: number, recall: number, beta: number): number {
    const beta2 = beta * beta;
    const denom = beta2 * precision + recall;
    return denom > 0 ? ((1 + beta2) * precision * recall) / denom : 0;
}

export function scoreProfile(
    evaluationList: Evaluation[],
    categoryByComment: Map<string, string>,
    profileName: ProfileName,
    beta: number,
): ProfileScore {
    const categorySet = PROFILE_CATEGORY[profileName];
    let tp = 0;
    let fp = 0;
    let fn = 0;
    let attemptCount = 0;
    for (const evaluation of evaluationList) {
        if (evaluation.skipped) continue;
        attemptCount++;
        tp += evaluation.truePositiveList.filter((item) =>
            categorySet.has(item.category || categoryByComment.get(item.goldenComment) || ""),
        ).length;
        fn += evaluation.falseNegativeList.filter((item) =>
            categorySet.has(item.category || categoryByComment.get(item.goldenComment) || ""),
        ).length;
        fp += evaluation.fp;
    }
    const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
    const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
    return {
        precision,
        recall,
        f1: fbeta(precision, recall, 1),
        fbeta: fbeta(precision, recall, beta),
        tp,
        fp,
        fn,
        attemptCount,
    };
}

export function isProfileName(value: string): value is ProfileName {
    return (PROFILE_NAME_LIST as readonly string[]).includes(value);
}
