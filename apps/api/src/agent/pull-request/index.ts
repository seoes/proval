import type { LlmSender } from "../llm/loop.js";
import type { GitProvider } from "../../git-provider/types.js";
import type { Workspace } from "../../git-provider/workspace.js";
import type { ActivityTokenUsage } from "@proval/types";
import type { ReviewUnit } from "./review/plan.schema.js";

type PullRequestReviewParams = {
    provider: GitProvider;
    workspace: Workspace;
    llmSender: LlmSender;
    prIid: number;
    isInlineReview: boolean;
    language: string;
    activityId: number;
};

type PullRequestReplyParams = {
    provider: GitProvider;
    workspace: Workspace;
    llmSender: LlmSender;
    prIid: number;
    commentId: number;
    language: string;
    activityId: number;
};

export type PullRequestReviewSubAgentResult = {
    index: number;
    total: number;
    reviewUnit: ReviewUnit;
    finalMessage: string;
    inputToken: number;
    outputToken: number;
    cachedInputToken: number;
};

export type PullRequestReviewResult = ActivityTokenUsage & {
    reviewUnitList: ReviewUnit[];
    subAgentList: PullRequestReviewSubAgentResult[];
};

export type PullRequestReview = (params: PullRequestReviewParams) => Promise<PullRequestReviewResult>;
export type PullRequestCommentReply = (params: PullRequestReplyParams) => Promise<ActivityTokenUsage>;
export type PullRequestInlineReviewReply = (
    params: PullRequestReplyParams & { inlineReviewId: string },
) => Promise<ActivityTokenUsage>;

export { runPullRequestReview } from "./review/index.js";
export { runPullRequestReply } from "./reply/index.js";
