import type { ActivityTriageJson } from "@proval/db";
import type { GitProvider } from "../git-provider/types.js";
import type { ActivityService } from "../api/activity/activity.service.js";
import { hasVersionDelta } from "./capability.js";
import { DEFAULT_TRIAGE_SETTINGS, triagePullRequest, type TriageDepth, type TriageSettings } from "./rules.js";

export interface TriageForReviewInput {
    provider: GitProvider;
    activityService: ActivityService;
    repositoryId: number;
    prIid: number;
    title: string;
    author: string;
    /** Whether the repository has opted in to acting on the result. */
    enabled: boolean;
    settings?: Partial<TriageSettings>;
    /**
     * Where a failure is reported. Injected rather than imported because util/log pulls
     * in the activity service and its database, which must not happen on this module's
     * import path: a pure module stays easy to test and cannot pre-load what another
     * test wants to mock.
     */
    logError?: (message: string, error: unknown) => void;
}

export interface TriageForReviewResult {
    record: ActivityTriageJson;
    /** The depth to actually use: the record's when enabled, otherwise normal. */
    effectiveDepth: TriageDepth;
}

/**
 * How many model round trips each review unit's sub agent may spend. Null means the
 * loop's own default. A light review caps this as well as the unit count, because a
 * cap on breadth alone leaves two sub agents free to read as much as five would have.
 */
export function unitStepBudgetForDepth(depth: TriageDepth): number | null {
    switch (depth) {
        case "light":
            return 24;
        case "skip":
            return 0;
        case "normal":
            return null;
    }
}

/** Both budgets a depth implies, shaped to spread into the review params. */
export function reviewBudgetForDepth(
    depth: TriageDepth,
    env: Record<string, string | undefined> = process.env,
): { unitBudget: number | null; unitStepBudget: number | null } {
    return {
        unitBudget: unitBudgetForDepth(depth, reviewUnitCapFromEnv(env)),
        unitStepBudget: unitStepBudgetForDepth(depth),
    };
}

/**
 * The most review units any review may have, from PROVAL_REVIEW_UNIT_CAP. Unset means
 * the planner decides, which is how it has always been. The planner reads width off
 * the change, and on a wide one it can choose far more units than any step budget
 * can carry: one 30 file merge request was split into 14, the shared step budget ran
 * out before a single hand off, and 9M input tokens bought nothing. A cap turns that
 * into a review that finishes.
 */
export function reviewUnitCapFromEnv(env: Record<string, string | undefined> = process.env): number | null {
    const value = Number.parseInt((env.PROVAL_REVIEW_UNIT_CAP ?? "").trim(), 10);
    return Number.isFinite(value) && value > 0 ? value : null;
}

/** How many review units a depth allows the planner. Null means the planner decides. */
export function unitBudgetForDepth(depth: TriageDepth, cap: number | null = null): number | null {
    switch (depth) {
        case "light":
            return cap === null ? 2 : Math.min(2, cap);
        case "skip":
            return 0;
        case "normal":
            return cap;
    }
}

/**
 * Runs triage for a pull request review before any activity exists.
 *
 * This never throws. A provider or network failure yields a "normal" record whose
 * reason names the failure, because a triage stage that could cancel a review by
 * erroring would be worse than no triage at all. The record is always returned so it
 * can be written to the activity whether or not it is acted on.
 */
export async function triageForReview(input: TriageForReviewInput): Promise<TriageForReviewResult> {
    const settings: TriageSettings = { ...DEFAULT_TRIAGE_SETTINGS, ...(input.settings ?? {}) };
    let record: ActivityTriageJson;
    try {
        if (!hasVersionDelta(input.provider)) {
            // No versions API: the rules still run on the whole merge request from what
            // the provider can tell us, which for these providers is nothing yet.
            record = withApplied(
                triagePullRequest({
                    title: input.title,
                    author: input.author,
                    filePathList: [],
                    additions: 0,
                    deletions: 0,
                    delta: null,
                    settings,
                }),
                input.enabled,
            );
        } else {
            const summary = await input.provider.fetchPullRequestVersionSummary(input.prIid);
            const reviewedHeadSha = await input.activityService.findLastReviewedHeadSha(
                input.repositoryId,
                input.prIid,
            );
            const delta = reviewedHeadSha
                ? await input.provider.fetchPullRequestVersionDelta(input.prIid, reviewedHeadSha)
                : null;
            record = withApplied(
                triagePullRequest({
                    title: input.title,
                    author: input.author,
                    filePathList: summary.filePathList,
                    additions: summary.additions,
                    deletions: summary.deletions,
                    delta,
                    settings,
                }),
                input.enabled,
            );
        }
    } catch (error) {
        (input.logError ?? ((message, cause) => console.error(message, cause)))(
            "Triage failed, treating the review as normal",
            error,
        );
        record = {
            depth: "normal",
            rule: "default",
            reason: `triage failed: ${error instanceof Error ? error.message : String(error)}`,
            applied: false,
            evidence: { hadDelta: false, fileCount: 0, lineCount: 0, filePathList: [] },
        };
    }
    return { record, effectiveDepth: record.applied ? record.depth : "normal" };
}

function withApplied(record: Omit<ActivityTriageJson, "applied">, enabled: boolean): ActivityTriageJson {
    // "applied" records whether the depth changed anything. A normal depth changes
    // nothing whether or not triage is enabled, so it is never marked applied.
    return { ...record, applied: enabled && record.depth !== "normal" };
}
