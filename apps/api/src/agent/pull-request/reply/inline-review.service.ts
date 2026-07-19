import type { PullRequestInlineReviewReply } from "../index.js";
import { postDevDebugPullRequestComment } from "../../shared/util/debug.js";
import { logAgent, debug } from "../../../util/log";
import { runAgentLoop } from "../../llm/loop";
import { COMMENT_LANGUAGE_RULE } from "../../shared/prompt";
import { PR_INLINE_REVIEW_REPLY_APPENDIX } from "./inline-review.prompt.js";
import { PR_REPLY_BODY, PR_REPLY_WORKFLOW } from "./prompt/reply.prompt.js";
import {
    getChangedFileListTool,
    getPullRequestCommentListTool,
    getPullRequestDetailTool,
    getPullRequestInlineReviewCommentTool,
    getPullRequestInlineReviewListTool,
    getFileDiffTool,
    postPullRequestInlineReviewReplyTool,
} from "../tool";
import { getFileContentTool, globTool, grepTool, listDirectoryTool } from "../../shared/tool";

export const runPullRequestInlineReviewReply: PullRequestInlineReviewReply = async ({
    provider,
    workspace,
    llmSender,
    prIid,
    inlineReviewId,
    commentId,
    language,
    activityId,
}) => {
    const label = `[PR #${prIid}] Inline Review Reply`;
    try {
        logAgent(activityId, `fetching inline review comment ${commentId}`, label);
        const comment = await provider.fetchPullRequestInlineReviewComment(prIid, commentId);
        const { headSha } = await provider.fetchPullRequestVersion(prIid);
        logAgent(activityId, `version ready head=${headSha.slice(0, 12)}…`, label);
        await workspace.load({ headRef: headSha, prIid, activityId, label });

        const system = [PR_REPLY_BODY, PR_REPLY_WORKFLOW, PR_INLINE_REVIEW_REPLY_APPENDIX, COMMENT_LANGUAGE_RULE].join(
            "\n",
        );
        const prompt = `Reply to the new inline review comment on PR #${prIid}. (inlineReviewId: ${inlineReviewId}, commentId: ${commentId})`;

        debug(prompt, "prompt");

        const toolList = [
            getPullRequestInlineReviewCommentTool(provider, prIid),
            getPullRequestInlineReviewListTool(provider, prIid),
            getPullRequestCommentListTool(provider, prIid),
            getPullRequestDetailTool(provider, prIid),
            getChangedFileListTool(workspace),
            getFileDiffTool(workspace),
            grepTool(workspace),
            globTool(workspace),
            listDirectoryTool(workspace),
            getFileContentTool(workspace),
        ];

        const requiredToolList = [
            postPullRequestInlineReviewReplyTool(provider, prIid, inlineReviewId, comment.author, language),
        ];

        const result = await runAgentLoop(llmSender, system, prompt, label, {
            toolList,
            requiredToolList,
            activityId,
        });

        await postDevDebugPullRequestComment(provider, prIid, {
            sender: llmSender,
            workflow: "PR Inline Review Reply",
            usage: result.usage,
            fields: {
                "Pull Request IID": prIid,
                "Inline Review ID": inlineReviewId,
                "Comment ID": commentId,
            },
        });

        return result.usage;
    } finally {
        await workspace.clean();
    }
};
