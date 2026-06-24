import type { LlmSender } from "../llm/loop.js";
import type { GitProvider } from "../../git-provider/types.js";
import type { ActivityTokenUsage } from "@proval/types";

import { runDeepResearchReview } from "./deep-research.js";
import { runStandardReview } from "./standard.js";

export async function runPullRequestReview(
    provider: GitProvider,
    llmSender: LlmSender,
    prIid: number,
    isInlineReview: boolean,
    isDeepResearch: boolean,
    language: string,
): Promise<ActivityTokenUsage> {
    if (isDeepResearch) {
        return runDeepResearchReview(provider, llmSender, prIid, isInlineReview, language);
    } else {
        return runStandardReview(provider, llmSender, prIid, isInlineReview, language);
    }
}

export { runPullRequestReply } from "./reply.js";
