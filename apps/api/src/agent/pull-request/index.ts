import type { AgentLoopEvent, LlmSender } from "../llm/loop.js";
import type { GitProvider } from "../../git-provider/types.js";
import type { Workspace } from "../../git-provider/workspace.js";
import type { ActivityTokenUsage } from "@proval/types";
import type { ReviewHandoff } from "./review/handoff.schema.js";
import type { ReviewUnit, SkippedFile } from "./review/plan.schema.js";

export type ReviewMeasureEvent =
    | { type: "phase-start"; phase: "setup" | "plan" | "sub" | "writing" | "finalize" }
    | { type: "phase-end"; phase: "setup" | "plan" | "sub" | "writing" | "finalize" }
    | { type: "sub-start"; index: number; total: number }
    | { type: "sub-end"; index: number; ok: boolean }
    | { type: "agent"; agent: string; event: AgentLoopEvent };

type PullRequestReviewParams = {
    provider: GitProvider;
    workspace: Workspace;
    llmSender: LlmSender;
    prIid: number;
    isInlineReview: boolean;
    language: string;
    userPrompt?: string | null;
    activityId: number;
    isFollowUpReview?: boolean;
    /** Head SHA of the last completed Proval review on this PR (follow-up compare base). */
    previousHeadSha?: string | null;
    /** Review units the planner may create, decided by triage. Null leaves it to the planner. */
    unitBudget?: number | null;
    /** Steps each sub agent may spend; null is the loop default. Set by triage. */
    unitStepBudget?: number | null;
    /** Optional diagnostic event sink. Production calls omit it and keep their behavior. */
    onEvent?: (event: ReviewMeasureEvent) => void;
};

type PullRequestReplyParams = {
    provider: GitProvider;
    workspace: Workspace;
    llmSender: LlmSender;
    prIid: number;
    commentId: number;
    language: string;
    userPrompt?: string | null;
    activityId: number;
};

export type PullRequestReviewSubAgentResult = {
    index: number;
    total: number;
    reviewUnit: ReviewUnit;
    handoff: ReviewHandoff;
    inputToken: number;
    outputToken: number;
    cachedInputToken: number;
};

export type PullRequestReviewResult = ActivityTokenUsage & {
    reviewUnitList: ReviewUnit[];
    skippedFileList: SkippedFile[];
    subAgentList: PullRequestReviewSubAgentResult[];
};

export type PullRequestReview = (params: PullRequestReviewParams) => Promise<PullRequestReviewResult>;
export type PullRequestCommentReply = (params: PullRequestReplyParams) => Promise<ActivityTokenUsage>;
export type PullRequestInlineReviewReply = (
    params: PullRequestReplyParams & { inlineReviewId: string },
) => Promise<ActivityTokenUsage>;

export { runPullRequestReview } from "./review/index.js";
export { runPullRequestReply } from "./reply/index.js";
