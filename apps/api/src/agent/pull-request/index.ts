import type { LlmSender } from "../llm/loop.js";
import type { GitProvider } from "../../git-provider/types.js";
import type { ActivityTokenUsage } from "@proval/types";

import { runDeepResearchReview } from "./deep-research.js";
import { runStandardReview } from "./standard.js";

type PullRequestReviewParams = {
    provider: GitProvider;
    llmSender: LlmSender;
    prIid: number;
    isInlineReview: boolean;
    language: string;
};

export type PullRequestReview = (params: PullRequestReviewParams) => Promise<ActivityTokenUsage>;

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

export { runPullRequestReply } from "./reply.js";
