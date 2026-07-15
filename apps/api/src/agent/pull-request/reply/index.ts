import type { ActivityTokenUsage } from "@proval/types";
import type { LlmSender } from "../../llm/loop.js";
import type { GitProvider } from "../../../git-provider/types.js";
import type { Workspace } from "../../../git-provider/workspace.js";

import { runPullRequestCommentReply } from "./comment.service.js";
import { runPullRequestInlineReviewReply } from "./inline-review.service.js";

type PullRequestReplyParams = {
    provider: GitProvider;
    workspace: Workspace;
    llmSender: LlmSender;
    prIid: number;
    commentId: number;
    language: string;
};

export function runPullRequestReply(
    params: PullRequestReplyParams & { inlineReviewId: string | null },
): Promise<ActivityTokenUsage> {
    const { provider, workspace, llmSender, prIid, commentId, language, inlineReviewId } = params;

    if (inlineReviewId) {
        return runPullRequestInlineReviewReply({
            provider,
            workspace,
            llmSender,
            prIid,
            commentId,
            language,
            inlineReviewId,
        });
    }

    return runPullRequestCommentReply({ provider, workspace, llmSender, prIid, commentId, language });
}
