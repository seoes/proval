import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { OUTPUT_DIR } from "../load/git.js";
import { loadManifest } from "../load/manifest.js";
import { createChatComplete, isRateLimitError, isTimeoutError, sleep, type ChatComplete } from "./client.js";
import { loadGoldenByUrl } from "./golden.js";
import {
    dedupPrompt,
    evaluateReview,
    extractPrompt,
    isProfileName,
    joinInlineBody,
    judgePrompt,
    parseDedupGroupList,
    parseExtractIssueList,
    parseModelJson,
    scoreProfile,
    type Evaluation,
    type GoldenComment,
    type MatchResult,
    type ProfileName,
    type ProfileScore,
} from "./logic.js";
import { DEDUP_SYSTEM, EXTRACT_SYSTEM, JUDGE_SYSTEM } from "./prompt.js";

const EXTRACT_TIMEOUT_MS = 60_000;
const CALL_TIMEOUT_MS = 30_000;
const REVIEW_TIMEOUT_MS = 1_800_000;
const JUDGE_BATCH = 20;

type AttemptRef = {
    runId: string;
    caseId: string;
    sourceUrl: string;
    repeatIndex: number;
    attemptIndex: number;
};

export type ScoredAttempt = AttemptRef & {
    candidateList: string[];
    dedupGroupList: number[][] | null;
    dedupFallback: boolean;
    evaluation: Evaluation;
};

export type ScoreDocument = {
    judgeModel: string;
    beta: number;
    attemptList: ScoredAttempt[];
    missingRunIdList: string[];
    timedOutRunIdList: string[];
    primary: Record<ProfileName, ProfileScore>;
    pooled: Record<ProfileName, ProfileScore>;
};

type CandidateFile = Record<string, { textList: string[] }>;
type DedupFile = Record<string, { groupList: number[][]; fallback: boolean }>;
type EvaluationFile = Record<string, Evaluation>;

export function loadJudgeConfig(): { apiKey: string; baseURL: string; model: string } {
    const apiKey = process.env.JUDGE_API_KEY?.trim() || process.env.LLM_API_KEY?.trim();
    const baseURL = process.env.JUDGE_BASE_URL?.trim() || process.env.LLM_BASE_URL?.trim();
    const model = process.env.JUDGE_MODEL?.trim() || process.env.LLM_MODEL?.trim();
    const missingList = [
        !apiKey ? "JUDGE_API_KEY or LLM_API_KEY" : "",
        !baseURL ? "JUDGE_BASE_URL or LLM_BASE_URL" : "",
        !model ? "JUDGE_MODEL or LLM_MODEL" : "",
    ].filter(Boolean);
    if (!apiKey || !baseURL || !model) throw new Error(`Missing required env: ${missingList.join(", ")}`);
    return { apiKey, baseURL, model };
}

export async function runScore(option: {
    batchId: string;
    force: boolean;
    limit?: number;
    dedup: boolean;
    profileName: ProfileName;
    beta: number;
}): Promise<void> {
    const judge = loadJudgeConfig();
    const manifest = await loadManifest();
    const golden = await loadGoldenByUrl();
    const caseById = new Map(manifest.caseList.map((entry) => [entry.caseId, entry.sourceUrl]));
    const document = await scoreBatch({
        batchDir: join(OUTPUT_DIR, option.batchId),
        caseById,
        goldenByUrl: golden.byUrl,
        categoryByComment: golden.categoryByComment,
        completer: createChatComplete(judge),
        judgeModel: judge.model,
        force: option.force,
        limit: option.limit,
        dedup: option.dedup,
        beta: option.beta,
    });
    console.log(renderScoreText(document, option.profileName));
    console.log(`Score saved to ${join(OUTPUT_DIR, option.batchId, "score.json")}`);
    if (document.missingRunIdList.length > 0 || document.timedOutRunIdList.length > 0) {
        process.exitCode = 1;
    }
}

export async function scoreBatch(option: {
    batchDir: string;
    caseById: Map<string, string>;
    goldenByUrl: Map<string, GoldenComment[]>;
    categoryByComment: Map<string, string>;
    completer: ChatComplete;
    judgeModel: string;
    force: boolean;
    limit?: number;
    dedup: boolean;
    beta: number;
}): Promise<ScoreDocument> {
    const scoreDir = join(option.batchDir, "score");
    if (option.force) await rm(scoreDir, { recursive: true, force: true });
    await mkdir(scoreDir, { recursive: true });

    const attemptList = await loadCompletedAttemptList(option.batchDir, option.caseById);
    if (attemptList.length === 0) throw new Error(`no completed attempt in ${option.batchDir}`);
    for (const attempt of attemptList) {
        if (!option.goldenByUrl.has(attempt.sourceUrl)) {
            throw new Error(`no golden comments for ${attempt.caseId} (${attempt.sourceUrl})`);
        }
    }

    const candidatePath = join(scoreDir, "candidate.json");
    const dedupPath = join(scoreDir, "dedup.json");
    const evaluationPath = join(scoreDir, "evaluation.json");
    const candidateFile = await readJson<CandidateFile>(candidatePath, {});
    const dedupFile = await readJson<DedupFile>(dedupPath, {});
    const evaluationFile = await readJson<EvaluationFile>(evaluationPath, {});

    const pendingList = attemptList.filter((attempt) => option.force || !evaluationFile[attempt.runId]);
    const workList = option.limit === undefined ? pendingList : pendingList.slice(0, option.limit);
    const missingRunIdList: string[] = [];
    const timedOutRunIdList: string[] = [];

    for (const attempt of workList) {
        const body = await readPostedBody(option.batchDir, attempt.runId);
        if (body === null) {
            missingRunIdList.push(attempt.runId);
            console.log(`missing review ${attempt.runId}`);
            continue;
        }
        if (!candidateFile[attempt.runId]) {
            const extracted = await extractIssueList(option.completer, body);
            if (extracted.skipped) continue;
            if (extracted.error) {
                console.log(`extract failed ${attempt.runId} ${extracted.error}`);
                continue;
            }
            candidateFile[attempt.runId] = { textList: extracted.issueList };
            await writeJson(candidatePath, candidateFile);
            console.log(`extract ${attempt.caseId} r${attempt.repeatIndex} ${extracted.issueList.length} issues`);
        }
    }

    for (const attempt of workList) {
        if (missingRunIdList.includes(attempt.runId)) continue;
        const candidateList =
            candidateFile[attempt.runId]?.textList ?? (await rawBodyList(option.batchDir, attempt.runId));
        if (!option.dedup) {
            dedupFile[attempt.runId] = { groupList: candidateList.map((_, index) => [index]), fallback: false };
            continue;
        }
        if (dedupFile[attempt.runId] && !option.force) continue;
        if (candidateList.length < 2) {
            dedupFile[attempt.runId] = { groupList: candidateList.map((_, index) => [index]), fallback: false };
            continue;
        }
        const groupList = await dedupIssueList(option.completer, candidateList);
        const fallback = groupList === null;
        dedupFile[attempt.runId] = {
            groupList: groupList ?? candidateList.map((_, index) => [index]),
            fallback,
        };
        await writeJson(dedupPath, dedupFile);
        console.log(`dedup ${attempt.caseId} r${attempt.repeatIndex}${fallback ? " fallback" : ""}`);
    }
    if (!option.dedup) await writeJson(dedupPath, dedupFile);

    for (const attempt of workList) {
        if (missingRunIdList.includes(attempt.runId) || evaluationFile[attempt.runId]) continue;
        const goldenCommentList = option.goldenByUrl.get(attempt.sourceUrl) ?? [];
        const candidateList =
            candidateFile[attempt.runId]?.textList ?? (await rawBodyList(option.batchDir, attempt.runId));
        const dedup = dedupFile[attempt.runId];
        const judged = await judgeAttempt(
            option.completer,
            goldenCommentList,
            candidateList,
            option.dedup ? (dedup?.groupList ?? null) : null,
        );
        if (judged.timedOut) {
            timedOutRunIdList.push(attempt.runId);
            console.log(`judge timed out ${attempt.runId}`);
            continue;
        }
        evaluationFile[attempt.runId] = judged.evaluation;
        await writeJson(evaluationPath, evaluationFile);
        console.log(
            `judge ${attempt.caseId} r${attempt.repeatIndex} tp=${judged.evaluation.tp} fp=${judged.evaluation.fp} fn=${judged.evaluation.fn}`,
        );
    }

    const scoredList: ScoredAttempt[] = [];
    for (const attempt of attemptList) {
        const evaluation = evaluationFile[attempt.runId];
        if (!evaluation) continue;
        const candidateList =
            candidateFile[attempt.runId]?.textList ?? (await rawBodyList(option.batchDir, attempt.runId));
        const dedup = dedupFile[attempt.runId];
        scoredList.push({
            ...attempt,
            candidateList,
            dedupGroupList: dedup?.groupList ?? null,
            dedupFallback: dedup?.fallback ?? false,
            evaluation,
        });
    }

    const document: ScoreDocument = {
        judgeModel: option.judgeModel,
        beta: option.beta,
        attemptList: scoredList,
        missingRunIdList,
        timedOutRunIdList,
        primary: profileRecord(
            primaryAttemptList(scoredList).map((attempt) => attempt.evaluation),
            option.categoryByComment,
            option.beta,
        ),
        pooled: profileRecord(
            scoredList.map((attempt) => attempt.evaluation),
            option.categoryByComment,
            option.beta,
        ),
    };
    await writeJson(join(option.batchDir, "score.json"), document);
    return document;
}

async function loadCompletedAttemptList(batchDir: string, caseById: Map<string, string>): Promise<AttemptRef[]> {
    const content = await readFile(join(batchDir, "result.jsonl"), "utf-8");
    const attemptList: AttemptRef[] = [];
    for (const line of content.split("\n")) {
        if (!line.trim()) continue;
        const record = JSON.parse(line) as {
            type?: string;
            status?: string;
            runId?: string;
            caseId?: string;
            repeatIndex?: number;
            attemptIndex?: number;
        };
        if (record.type !== "result" || record.status !== "completed") continue;
        if (!record.runId || !record.caseId || record.repeatIndex === undefined || record.attemptIndex === undefined) {
            throw new Error("completed result is missing run identity");
        }
        const sourceUrl = caseById.get(record.caseId);
        if (!sourceUrl) throw new Error(`case ${record.caseId} is not in the manifest`);
        attemptList.push({
            runId: record.runId,
            caseId: record.caseId,
            sourceUrl,
            repeatIndex: record.repeatIndex,
            attemptIndex: record.attemptIndex,
        });
    }
    return attemptList.sort(
        (left, right) =>
            left.caseId.localeCompare(right.caseId) ||
            left.repeatIndex - right.repeatIndex ||
            left.attemptIndex - right.attemptIndex,
    );
}

async function readPostedBody(batchDir: string, runId: string): Promise<string | null> {
    try {
        const review = JSON.parse(await readFile(join(batchDir, "attempt", runId, "review.json"), "utf-8")) as {
            posted?: { type?: string; body?: string }[];
        };
        return joinInlineBody(review.posted ?? []);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
    }
}

async function rawBodyList(batchDir: string, runId: string): Promise<string[]> {
    const body = await readPostedBody(batchDir, runId);
    if (!body) return [];
    return body.split("\n\n---\n\n").filter(Boolean);
}

async function extractIssueList(
    completer: ChatComplete,
    comment: string,
): Promise<{ issueList: string[]; error?: string; skipped?: boolean }> {
    if (comment.trim().length < 20) return { issueList: [], skipped: true };
    let lastError = "Max retries exceeded";
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            const parsed = parseExtractIssueList(
                await completer(EXTRACT_SYSTEM, extractPrompt(comment), EXTRACT_TIMEOUT_MS),
            );
            if (!parsed.error) return parsed;
            if (parsed.error === "Missing issues key") return parsed;
            lastError = parsed.error;
            if (attempt < 2) await sleep(1000);
        } catch (error) {
            lastError = error instanceof Error ? error.message : String(error);
            if (attempt < 2) await sleep(isRateLimitError(error) ? rateLimitWait(attempt) : 2 ** attempt * 1000);
        }
    }
    return { issueList: [], error: lastError };
}

async function dedupIssueList(completer: ChatComplete, candidateList: string[]): Promise<number[][] | null> {
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            const groupList = parseDedupGroupList(
                await completer(DEDUP_SYSTEM, dedupPrompt(candidateList), CALL_TIMEOUT_MS),
                candidateList.length,
            );
            if (groupList) return groupList;
            if (attempt < 2) await sleep(1000);
        } catch (error) {
            if (attempt === 2) return null;
            await sleep(retryWait(error, attempt));
        }
    }
    return null;
}

async function judgeAttempt(
    completer: ChatComplete,
    goldenCommentList: GoldenComment[],
    candidateList: string[],
    dedupGroupList: number[][] | null,
): Promise<{ evaluation: Evaluation; timedOut: boolean }> {
    if (candidateList.length === 0 || goldenCommentList.length === 0) {
        return { evaluation: evaluateReview(goldenCommentList, candidateList, [], dedupGroupList), timedOut: false };
    }
    const pairList = goldenCommentList.flatMap((golden) =>
        candidateList.map((candidate) => ({ golden: golden.comment, candidate })),
    );
    const started = Date.now();
    const matchResultList: MatchResult[] = [];
    for (let index = 0; index < pairList.length; index += JUDGE_BATCH) {
        if (Date.now() - started > REVIEW_TIMEOUT_MS)
            return { evaluation: evaluateReview(goldenCommentList, [], [], null), timedOut: true };
        const batch = pairList.slice(index, index + JUDGE_BATCH);
        const batchResult = await Promise.all(batch.map((pair) => judgePair(completer, pair.golden, pair.candidate)));
        matchResultList.push(...batchResult);
        if (index + JUDGE_BATCH < pairList.length) await sleep(200);
    }
    if (Date.now() - started > REVIEW_TIMEOUT_MS) {
        return { evaluation: evaluateReview(goldenCommentList, [], [], null), timedOut: true };
    }
    return {
        evaluation: evaluateReview(goldenCommentList, candidateList, matchResultList, dedupGroupList),
        timedOut: false,
    };
}

async function judgePair(completer: ChatComplete, goldenComment: string, candidate: string): Promise<MatchResult> {
    let lastError = "Max retries exceeded";
    for (let attempt = 0; attempt < 5; attempt++) {
        try {
            const parsed = parseModelJson(
                await completer(JUDGE_SYSTEM, judgePrompt(goldenComment, candidate), CALL_TIMEOUT_MS),
            );
            if (!parsed || typeof parsed !== "object") throw new SyntaxError("JSON parse failed");
            const record = parsed as MatchResult & { error?: string };
            if (typeof record.error === "string") return { error: record.error };
            return {
                match: Boolean(record.match),
                confidence: typeof record.confidence === "number" ? record.confidence : undefined,
                reasoning: typeof record.reasoning === "string" ? record.reasoning : undefined,
            };
        } catch (error) {
            lastError = error instanceof Error ? error.message : String(error);
            if (attempt < 4) await sleep(error instanceof SyntaxError ? 1000 : retryWait(error, attempt));
        }
    }
    return { error: lastError };
}

function retryWait(error: unknown, attempt: number): number {
    if (isRateLimitError(error)) return rateLimitWait(attempt);
    if (isTimeoutError(error)) return 2 ** attempt * 1000;
    return 2 ** attempt * 1000;
}

function rateLimitWait(attempt: number): number {
    return Math.min(10 * 3 ** attempt, 120) * 1000;
}

function primaryAttemptList(attemptList: ScoredAttempt[]): ScoredAttempt[] {
    const byCase = new Map<string, ScoredAttempt>();
    const sorted = [...attemptList].sort(
        (left, right) => left.repeatIndex - right.repeatIndex || left.attemptIndex - right.attemptIndex,
    );
    for (const attempt of sorted) {
        if (!byCase.has(attempt.caseId)) byCase.set(attempt.caseId, attempt);
    }
    return [...byCase.values()];
}

function profileRecord(
    evaluationList: Evaluation[],
    categoryByComment: Map<string, string>,
    beta: number,
): Record<ProfileName, ProfileScore> {
    return {
        strict: scoreProfile(evaluationList, categoryByComment, "strict", beta),
        core: scoreProfile(evaluationList, categoryByComment, "core", beta),
        all: scoreProfile(evaluationList, categoryByComment, "all", beta),
    };
}

export function renderScoreText(document: ScoreDocument, profileName: ProfileName): string {
    const lineList = [
        `Judge ${document.judgeModel}`,
        `Scored attempts ${document.attemptList.length}`,
        renderProfileLine("primary", document.primary[profileName], profileName, document.beta),
    ];
    if (document.pooled[profileName].attemptCount !== document.primary[profileName].attemptCount) {
        lineList.push(renderProfileLine("pooled", document.pooled[profileName], profileName, document.beta));
    }
    if (document.missingRunIdList.length > 0) lineList.push(`Missing review ${document.missingRunIdList.join(", ")}`);
    if (document.timedOutRunIdList.length > 0) lineList.push(`Timed out ${document.timedOutRunIdList.join(", ")}`);
    return lineList.join("\n");
}

function renderProfileLine(label: string, score: ProfileScore, profileName: ProfileName, beta: number): string {
    const percent = (value: number) => `${(value * 100).toFixed(1)}%`;
    return `${label} ${profileName} F${beta} precision ${percent(score.precision)} recall ${percent(score.recall)} F1 ${percent(score.f1)} tp ${score.tp} fp ${score.fp} fn ${score.fn}`;
}

export function parseScoreOption(argList: string[]): {
    batchId: string;
    force: boolean;
    limit?: number;
    dedup: boolean;
    profileName: ProfileName;
    beta: number;
} {
    const batchId = argList[0];
    if (!batchId || batchId.startsWith("--"))
        throw new Error(
            "usage: benchmark score <batchId> [--force] [--limit n] [--no-dedup] [--profile core] [--beta 2]",
        );
    const profileName = optionValue(argList, "profile") ?? "core";
    if (!isProfileName(profileName)) throw new Error("--profile must be strict, core or all");
    const betaText = optionValue(argList, "beta");
    const beta = betaText === undefined ? 2 : Number(betaText);
    if (!Number.isFinite(beta) || beta <= 0) throw new Error("--beta must be a positive number");
    const limitText = optionValue(argList, "limit");
    let limit: number | undefined;
    if (limitText !== undefined) {
        if (!/^[1-9]\d*$/.test(limitText)) throw new Error("--limit must be a positive integer");
        limit = Number(limitText);
    }
    return {
        batchId,
        force: argList.includes("--force"),
        limit,
        dedup: !argList.includes("--no-dedup"),
        profileName,
        beta,
    };
}

function optionValue(argList: string[], name: string): string | undefined {
    const index = argList.indexOf(`--${name}`);
    return index >= 0 ? argList[index + 1] : undefined;
}

async function readJson<T>(path: string, fallback: T): Promise<T> {
    try {
        return JSON.parse(await readFile(path, "utf-8")) as T;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback;
        throw error;
    }
}

async function writeJson(path: string, value: unknown): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}
