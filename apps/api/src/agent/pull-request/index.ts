import type { LlmSender } from "../llm/loop.js";
import type { GitProvider } from "../../git-provider/types.js";
import type { ActivityTokenUsage } from "@proval/types";

import { runDeepResearchReview } from "./deep-research.js";
import { runStandardReview } from "./standard.js";
import { runPullRequestCommentReply } from "./reply.js";
import { runPullRequestInlineReviewReply } from "./reply-inline-review.js";

type PullRequestReviewParams = {
    provider: GitProvider;
    llmSender: LlmSender;
    prIid: number;
    isInlineReview: boolean;
    language: string;
};

type PullRequestReplyParams = {
    provider: GitProvider;
    llmSender: LlmSender;
    prIid: number;
    commentId: number;
    language: string;
};

export type PullRequestReview = (params: PullRequestReviewParams) => Promise<ActivityTokenUsage>;

export type PullRequestCommentReply = (params: PullRequestReplyParams) => Promise<ActivityTokenUsage>;
export type PullRequestInlineReviewReply = (
    params: PullRequestReplyParams & { reviewId: string },
) => Promise<ActivityTokenUsage>;

export function runPullRequestReview(
    params: PullRequestReviewParams & { isDeepResearch: boolean },
): Promise<ActivityTokenUsage> {
    const { isDeepResearch, ...reviewParams } = params;
    if (isDeepResearch) {
        return runDeepResearchReview(reviewParams);
    } else {
        return runStandardReview(reviewParams);
    }
}

export function runPullRequestReply(
    params: PullRequestReplyParams & { reviewId: string | null },
): Promise<ActivityTokenUsage> {
    const { provider, llmSender, prIid, commentId, language, reviewId } = params;

    if (reviewId) {
        return runPullRequestInlineReviewReply({ provider, llmSender, prIid, commentId, language, reviewId });
    } else {
        return runPullRequestCommentReply({ provider, llmSender, prIid, commentId, language });
    }
}
