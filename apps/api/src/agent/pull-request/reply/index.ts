import type { ActivityTokenUsage } from "@proval/types";
import type { LlmSender } from "../../llm/loop.js";
import type { GitProvider } from "../../../git-provider/types.js";

import { runPullRequestCommentReply } from "./comment.js";
import { runPullRequestInlineReviewReply } from "./inline-review.js";

type PullRequestReplyParams = {
    provider: GitProvider;
    llmSender: LlmSender;
    prIid: number;
    commentId: number;
    language: string;
};

export function runPullRequestReply(
    params: PullRequestReplyParams & { inlineReviewId: string | null },
): Promise<ActivityTokenUsage> {
    const { provider, llmSender, prIid, commentId, language, inlineReviewId } = params;

    if (inlineReviewId) {
        return runPullRequestInlineReviewReply({ provider, llmSender, prIid, commentId, language, inlineReviewId });
    }

    return runPullRequestCommentReply({ provider, llmSender, prIid, commentId, language });
}
