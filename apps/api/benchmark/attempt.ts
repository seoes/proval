/**
 * Child process entry. Runs exactly one review attempt against a frozen
 * manifest case and writes run.json plus review artifacts into the batch
 * output directory. The parent runner owns scheduling and cleanup.
 *
 * argv: --batch <id> --case <caseId> --repeat <n> --attempt <n> --run-id <id>
 */

function argValue(name: string): string | null {
    const index = process.argv.indexOf(`--${name}`);
    return index >= 0 ? (process.argv[index + 1] ?? null) : null;
}

function requireArg(name: string): string {
    const value = argValue(name);
    if (!value) throw new Error(`missing --${name}`);
    return value;
}

const batchId = requireArg("batch");
const caseId = requireArg("case");
const repeatIndex = Number.parseInt(requireArg("repeat"), 10);
const attemptIndex = Number.parseInt(requireArg("attempt"), 10);
const runId = requireArg("run-id");

import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { OUTPUT_DIR } from "./git.js";
import { loadManifest, MANIFEST_PATH } from "./load.js";
import type { BenchmarkLlmConfig, BenchmarkProfile, ManifestCase } from "./types.js";
import {
    collectSourceState,
    loadBenchmarkLlmConfig,
    loadDotEnvFile,
    loadProfile,
    hashFileContent,
    machineDescription,
    safeUrl,
    PROFILE_PATH,
    REPO_ROOT,
} from "./util.js";
import {
    MeasureCollector,
    measureSender,
    type AttemptStatus,
    type PhaseTiming,
    type SubAgentMeasure,
} from "./measure.js";
import { createCaseWorkdir, prepareCase } from "./load.js";

const attemptDir = join(OUTPUT_DIR, batchId, "attempt", runId);
const dbFile = join(OUTPUT_DIR, batchId, "tmp", `${runId}.db`);

// Must be set before any agent chain import, the db module opens its file at import time.
process.env.DB_FILE_NAME = dbFile;
// Match production behavior: no dev debug comments, no debug log noise.
process.env.NODE_ENV = "production";

type ReproInfo = {
    provalCommit: string;
    isDirty: boolean;
    sourceStateHash: string;
    datasetCommit: string;
    manifestHash: string;
    profileHash: string;
    bunVersion: string;
    modelName: string;
    modelProvider: string;
    modelBaseUrl: string;
    reasoningEffort: string | null;
    llmConcurrency: number | null;
    machineDescription: string;
};

type RunRecord = {
    type: "attempt";
    runId: string;
    caseId: string;
    project: string;
    repeatIndex: number;
    attemptIndex: number;
    status: AttemptStatus | "running";
    statusReason: string | null;
    phase: string;
    startedAt: string;
    finishedAt: string | null;
    timing: PhaseTiming;
    sender: unknown;
    loopStepCount: number | null;
    toolCallCount: number | null;
    reviewUnitCount: number | null;
    subAgentList: SubAgentMeasure[];
    changedFileCount: number;
    addedLineCount: number;
    deletedLineCount: number;
    plannedFileCount: number | null;
    skippedFileCount: number | null;
    coverageMissList: string[];
    postedCommentCount: number | null;
    postedInlineCount: number | null;
    approval: string | null;
    evaluation: "good" | "issue" | null;
    tokenUsage: { inputToken: number; outputToken: number; cachedInputToken: number } | null;
    error: string | null;
    repro: ReproInfo;
};

async function migrateDatabase(): Promise<void> {
    await mkdir(join(dbFile, ".."), { recursive: true });
    const { migrate } = await import("drizzle-orm/bun-sqlite/migrator");
    const db = (await import("../src/db/index.js")).default;
    db.$client.run("PRAGMA foreign_keys = OFF");
    try {
        migrate(db, {
            migrationsFolder: resolve(import.meta.dir, "..", "..", "..", "packages", "db", "src", "migration"),
        });
    } finally {
        db.$client.run("PRAGMA foreign_keys = ON");
    }
}

/**
 * The agent chain persists logs, token usage and posted comment records
 * against an activity id, and the cancellation lookup queries the activity
 * table. A real row keeps those effects intact inside the benchmark database.
 */
async function createActivityRow(entry: ManifestCase, modelName: string): Promise<number> {
    const db = (await import("../src/db/index.js")).default;
    const { activityTable } = await import("@proval/db");
    const [row] = await db
        .insert(activityTable)
        .values({
            repositoryPath: "benchmark/mock",
            provider: "github",
            modelName,
            type: "pr_review",
            status: "started",
            targetIid: entry.prNumber,
            headSha: entry.headSha,
            logVersion: "1",
        })
        .returning({ id: activityTable.id });
    return row!.id;
}

async function main(): Promise<void> {
    await loadDotEnvFile(resolve(REPO_ROOT, ".env.benchmark"));
    const manifest = await loadManifest();
    const profile = await loadProfile();
    const entry = manifest.caseList.find((item) => item.caseId === caseId);
    if (!entry) {
        throw new Error(`case ${caseId} is not in the manifest`);
    }

    const llm = loadBenchmarkLlmConfig();
    const sourceState = await collectSourceState();
    const repro: ReproInfo = {
        provalCommit: sourceState.provalCommit,
        isDirty: sourceState.isDirty,
        sourceStateHash: sourceState.sourceStateHash,
        datasetCommit: manifest.datasetCommit,
        manifestHash: await hashFileContent(MANIFEST_PATH),
        profileHash: await hashFileContent(PROFILE_PATH),
        bunVersion: Bun.version,
        modelName: llm.model,
        modelProvider: llm.provider,
        modelBaseUrl: safeUrl(llm.baseUrl),
        reasoningEffort: profile.setting.reasoningEffort,
        llmConcurrency: profile.setting.llmConcurrency,
        machineDescription: machineDescription(),
    };

    const collector = new MeasureCollector();
    const record: RunRecord = {
        type: "attempt",
        runId,
        caseId,
        project: entry.project,
        repeatIndex,
        attemptIndex,
        status: "running",
        statusReason: null,
        phase: "prepare",
        startedAt: new Date().toISOString(),
        finishedAt: null,
        timing: collector.timing,
        sender: null,
        loopStepCount: null,
        toolCallCount: null,
        reviewUnitCount: null,
        subAgentList: [],
        changedFileCount: entry.changedFileCount,
        addedLineCount: entry.addedLineCount,
        deletedLineCount: entry.deletedLineCount,
        plannedFileCount: null,
        skippedFileCount: null,
        coverageMissList: [],
        postedCommentCount: null,
        postedInlineCount: null,
        approval: null,
        evaluation: null,
        tokenUsage: null,
        error: null,
        repro,
    };

    await mkdir(attemptDir, { recursive: true });
    const flush = async () => {
        await writeFile(join(attemptDir, "run.json"), `${JSON.stringify(record, null, 2)}\n`);
    };
    await flush();

    const heartbeat = setInterval(() => {
        const elapsedSec = Math.round((Date.now() - new Date(record.startedAt).getTime()) / 1000);
        console.log(`[heartbeat] ${runId} elapsed ${elapsedSec}s phase ${collector.currentPhase()}`);
    }, 30_000);

    try {
        await migrateDatabase();
        await runAttempt(entry, profile, llm, collector, record);
    } catch (error) {
        record.status = "failed";
        record.statusReason = "runner-error";
        record.error = error instanceof Error ? (error.stack ?? error.message) : String(error);
    } finally {
        clearInterval(heartbeat);
        record.phase = collector.currentPhase();
        record.finishedAt = new Date().toISOString();
        await flush();
    }
}

async function runAttempt(
    entry: ManifestCase,
    profile: BenchmarkProfile,
    llm: BenchmarkLlmConfig,
    collector: MeasureCollector,
    record: RunRecord,
): Promise<void> {
    const { MockProvider } = await import("../mock/provider.js");
    const { Workspace } = await import("../src/git-provider/workspace.js");
    const { createSender } = await import("../src/agent/llm/factory.js");
    const { runPullRequestReview } = await import("../src/agent/pull-request/index.js");
    const { JobCanceledError } = await import("../src/agent/llm/loop.js");
    const { git } = await import("./git.js");

    let workdir: string | null = null;
    const prepareStart = performance.now();
    try {
        await prepareCase(entry);
        workdir = await createCaseWorkdir(entry, runId);
        collector.timing.prepareMs = Math.round(performance.now() - prepareStart);
    } catch (error) {
        collector.timing.prepareMs = Math.round(performance.now() - prepareStart);
        record.status = "prepareFailed";
        record.statusReason = "prepare-error";
        record.error = error instanceof Error ? error.message : String(error);
        return;
    }

    // The mock only needs metadata. The agent reads code and diffs through the workspace.
    const nsOutput = await git(["diff", "--name-status", "-M", entry.startSha, entry.headSha], workdir);
    const diffList = nsOutput
        .split("\n")
        .filter(Boolean)
        .map((line) => {
            const tab = line.split("\t");
            const code = tab[0] ?? "";
            const isRename = code.startsWith("R");
            const isDelete = code === "D";
            const isAdd = code === "A";
            const oldPath = isRename || isDelete ? (tab[1] ?? "") : isAdd ? "" : (tab[1] ?? "");
            const newPath = isRename ? (tab[2] ?? "") : (tab[1] ?? "");
            return {
                oldPath: isAdd ? newPath : oldPath,
                newPath,
                newFile: isAdd,
                renamedFile: isRename,
                deletedFile: isDelete,
                diff: "",
            };
        });

    const provider = new MockProvider({
        detail: {
            title: entry.title,
            description: entry.body || null,
            sourceBranch: "benchmark-head",
            targetBranch: "benchmark-base",
            author: "benchmark",
            state: "opened",
        },
        diffs: diffList,
        version: { baseSha: entry.baseSha, startSha: entry.startSha, headSha: entry.headSha },
    });
    const workspace = new Workspace(provider);
    await workspace.adopt(workdir);

    const activityId = await createActivityRow(entry, llm.model);

    const fakeSenderKind = process.env.BENCHMARK_FAKE_SENDER?.trim();
    const rawSender = fakeSenderKind
        ? (await import("./sender.js")).createFakeSender(fakeSenderKind)
        : createSender({
              provider: llm.provider,
              apiKey: llm.apiKey,
              baseURL: llm.baseUrl,
              model: llm.model,
              timeoutSecond: profile.setting.timeoutSecond,
              reasoningEffort: (profile.setting.reasoningEffort ?? undefined) as never,
              concurrency: profile.setting.llmConcurrency,
          });
    const measured = measureSender(rawSender);

    const reviewStart = performance.now();
    type ReviewResult = Awaited<ReturnType<typeof runPullRequestReview>>;
    let review: ReviewResult | null = null;
    let reviewError: unknown = null;
    try {
        review = await runPullRequestReview({
            provider,
            workspace,
            llmSender: measured.sender,
            prIid: entry.prNumber,
            isInlineReview: profile.setting.inlineReview,
            language: profile.setting.language,
            userPrompt: profile.setting.userPrompt || null,
            activityId,
            isFollowUpReview: false,
            previousHeadSha: null,
            onEvent: collector.handleEvent,
        });
    } catch (error) {
        reviewError = error;
    } finally {
        collector.timing.reviewMs = Math.round(performance.now() - reviewStart);
    }

    measured.stat.retryCount = collector.aggregateRetryCount();
    measured.stat.compressionCount = collector.aggregateCompressionCount();
    record.sender = measured.stat;
    record.tokenUsage = {
        inputToken: measured.stat.inputToken,
        outputToken: measured.stat.outputToken,
        cachedInputToken: measured.stat.cachedInputToken,
    };
    record.loopStepCount = collector.loopStepCountTotal();
    record.toolCallCount = collector.toolCallCountTotal();

    const postedCommentCount = provider.posted.filter(
        (posted) => posted.type === "comment" && !posted.body.startsWith("## Debug"),
    ).length;
    const postedInlineCount = provider.posted.filter((posted) => posted.type === "inline").length;
    const approveAction = provider.posted.find((posted) => posted.type === "approve");
    const unapproveAction = provider.posted.find((posted) => posted.type === "unapprove");
    record.postedCommentCount = postedCommentCount;
    record.postedInlineCount = postedInlineCount;
    record.approval = approveAction ? "approve" : unapproveAction ? "unapprove" : null;
    record.evaluation = provider.emojiList.some((item) => item.emoji === "👍") ? "good" : review ? "issue" : null;

    if (review) {
        record.reviewUnitCount = review.reviewUnitList.length;
        const plannedFileList = [...new Set(review.reviewUnitList.flatMap((unit) => unit.files))];
        const skippedPathList = review.skippedFileList.map((skipped) => skipped.path);
        record.plannedFileCount = plannedFileList.length;
        record.skippedFileCount = skippedPathList.length;
        const coveredSet = new Set([...plannedFileList, ...skippedPathList]);
        record.coverageMissList = diffList
            .filter((diff) => !coveredSet.has(diff.newPath) && !coveredSet.has(diff.oldPath))
            .map((diff) => diff.newPath || diff.oldPath)
            .filter(Boolean)
            .filter((path, index, list) => list.indexOf(path) === index);
        record.subAgentList = review.subAgentList.map((sub) => ({
            index: sub.index,
            durationMs: collector.subDurationMs(sub.index),
            ok: collector.subOk(sub.index),
            fileCount: sub.reviewUnit.files.length,
            stepCount: collector.loopStepCount(`sub-${sub.index}`),
            toolCallCount: collector.loopToolCallCount(`sub-${sub.index}`),
            inputToken: sub.inputToken,
            outputToken: sub.outputToken,
            cachedInputToken: sub.cachedInputToken,
        }));
    }

    await writeFile(
        join(attemptDir, "event.jsonl"),
        collector.eventList.map((entry2) => JSON.stringify(entry2)).join("\n") + "\n",
    );
    await writeFile(
        join(attemptDir, "review.json"),
        `${JSON.stringify(
            {
                posted: provider.posted,
                emojiList: provider.emojiList,
                reviewUnitList: review?.reviewUnitList ?? null,
                skippedFileList: review?.skippedFileList ?? null,
                subAgentList:
                    review?.subAgentList.map((sub) => ({
                        index: sub.index,
                        reviewUnit: sub.reviewUnit,
                        handoff: sub.handoff,
                        inputToken: sub.inputToken,
                        outputToken: sub.outputToken,
                        cachedInputToken: sub.cachedInputToken,
                    })) ?? null,
            },
            null,
            2,
        )}\n`,
    );

    if (reviewError) {
        const { name } = reviewError as { name?: string };
        if (reviewError instanceof JobCanceledError || name === "JobCanceledError") {
            record.status = "canceled";
            record.statusReason = "job-canceled";
        } else {
            record.status = "failed";
            record.statusReason = "review-error";
        }
        record.error = reviewError instanceof Error ? (reviewError.stack ?? reviewError.message) : String(reviewError);
        return;
    }

    if (collector.hasMaxStepsLoop()) {
        record.status = "incomplete";
        record.statusReason = "max-steps";
    } else if (record.coverageMissList.length > 0) {
        record.status = "incomplete";
        record.statusReason = "coverage-miss";
    } else if (postedCommentCount === 0) {
        record.status = "incomplete";
        record.statusReason = "missing-summary";
    } else {
        record.status = "completed";
        record.statusReason = null;
    }
}

main().catch((error) => {
    console.error("attempt runner crashed", error);
    process.exit(1);
});
