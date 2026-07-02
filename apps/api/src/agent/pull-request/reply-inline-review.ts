import type { PullRequestInlineReviewReply } from ".";
import { debug } from "../../util/log";
import { runAgentLoop } from "../llm/loop";
import { COMMENT_LANGUAGE_RULE } from "../shared/prompt";
import { PR_INLINE_REVIEW_REPLY_APPENDIX, PR_REPLY_BODY, PR_REPLY_WORKFLOW } from "./prompt";
import {
    getPullRequestCommentListTool,
    getPullRequestDetailTool,
    getPullRequestInlineReviewCommentTool,
    getPullRequestInlineReviewListTool,
    getFileDiffTool,
    postPullRequestInlineReviewReplyTool,
} from "./tool";
import {
    getDirectoryTreeTool,
    getMergeFileContentTool,
    searchCodeListTool,
    searchLineByKeywordTool,
} from "../shared/tool";

export const runPullRequestInlineReviewReply: PullRequestInlineReviewReply = async ({
    provider,
    llmSender,
    prIid,
    inlineReviewId,
    commentId,
    language,
}) => {
    const comment = await provider.fetchPullRequestInlineReviewComment(prIid, commentId);
    const { baseSha, headSha } = await provider.fetchPullRequestVersion(prIid);

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
        getFileDiffTool(provider, prIid),
        searchCodeListTool(provider, headSha),
        searchLineByKeywordTool(provider, headSha),
        getDirectoryTreeTool(provider, headSha),
        getMergeFileContentTool(provider, { baseSha, headSha }),
        postPullRequestInlineReviewReplyTool(provider, prIid, inlineReviewId, comment.author, language),
    ];

    const result = await runAgentLoop(llmSender, system, prompt, `[PR #${prIid}] Inline Review Reply`, {
        toolList,
        requiredToolList: ["post_pull_request_inline_review_reply"],
    });
    return result.usage;
};
