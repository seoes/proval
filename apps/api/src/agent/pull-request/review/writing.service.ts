import type { ActivityTokenUsage } from "@proval/types";
import type { GitProvider } from "../../../git-provider/types";
import type { Workspace } from "../../../git-provider/workspace.js";
import { runAgentLoop, type LlmSender } from "../../llm/loop";
import { INLINE_DISABLED, INLINE_ENABLED, SEVERITY } from "../prompt";
import { COMMENT_LANGUAGE_RULE } from "../../shared/prompt";
import { WRITING_WORKFLOW } from "./writing.prompt.js";
import { FOLLOW_UP_REVIEW_RULE } from "./follow-up.prompt.js";
import {
    createMultiLineCommentTool,
    createSingleLineCommentTool,
    getFileDiffTool,
    getPullRequestCommentListTool,
    getPullRequestCommentTool,
    getPullRequestInlineReviewCommentTool,
    getPullRequestInlineReviewListTool,
    getPushChangedFileListTool,
    getPushFileDiffTool,
    postPullRequestCommentTool,
} from "../tool";
import { getFileContentTool, globTool, grepTool, listDirectoryTool } from "../../shared/tool";

const PRIOR_SUMMARY_MAX_CHARS = 4000;

export async function runReviewWritingAgent(
    provider: GitProvider,
    workspace: Workspace,
    sender: LlmSender,
    pullRequestContextPrompt: string,
    prIid: number,
    baseSha: string,
    headSha: string,
    startSha: string,
    reviewResultList: string[],
    isInlineReview: boolean,
    language: string,
    activityId: number,
    isFollowUpReview = false,
    priorBotSummary: string | null = null,
    usePushScope = false,
): Promise<ActivityTokenUsage> {
    const system = [
        WRITING_WORKFLOW,
        isFollowUpReview ? FOLLOW_UP_REVIEW_RULE : null,
        SEVERITY,
        isInlineReview ? INLINE_ENABLED : INLINE_DISABLED,
        COMMENT_LANGUAGE_RULE,
    ]
        .filter(Boolean)
        .join("\n\n");

    const promptPartList = [
        pullRequestContextPrompt,
        isFollowUpReview && priorBotSummary
            ? `Prior Proval review summary (already posted, do not repeat the same findings):\n\n${priorBotSummary}`
            : null,
        `Review unit handoffs (plain text, one block per sub agent, each includes Findings and Good Points).\n\n${reviewResultList.join("\n\n")}`,
    ].filter(Boolean);

    const result = await runAgentLoop(sender, system, promptPartList.join("\n\n"), `[PR #${prIid}] Writing`, {
        toolList: [
            usePushScope ? getPushChangedFileListTool(workspace) : null,
            usePushScope ? getPushFileDiffTool(workspace) : null,
            getFileDiffTool(workspace),
            grepTool(workspace),
            globTool(workspace),
            listDirectoryTool(workspace),
            getFileContentTool(workspace),
            isFollowUpReview ? getPullRequestCommentListTool(provider, prIid) : null,
            isFollowUpReview ? getPullRequestCommentTool(provider, prIid) : null,
            isFollowUpReview ? getPullRequestInlineReviewListTool(provider, prIid) : null,
            isFollowUpReview ? getPullRequestInlineReviewCommentTool(provider, prIid) : null,
            isInlineReview
                ? createSingleLineCommentTool(
                      provider,
                      workspace,
                      prIid,
                      language,
                      baseSha,
                      headSha,
                      startSha,
                      activityId,
                  )
                : null,
            isInlineReview
                ? createMultiLineCommentTool(
                      provider,
                      workspace,
                      prIid,
                      language,
                      baseSha,
                      headSha,
                      startSha,
                      activityId,
                  )
                : null,
        ],
        requiredToolList: [postPullRequestCommentTool(provider, prIid, language, activityId)],
        activityId,
    });

    return result.usage;
}

export function truncatePriorSummary(body: string): string {
    if (body.length <= PRIOR_SUMMARY_MAX_CHARS) return body;
    return `${body.slice(0, PRIOR_SUMMARY_MAX_CHARS)}\n… (truncated)`;
}
