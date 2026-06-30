import type { PullRequestInlineReviewReply } from ".";
import { runAgentLoop } from "../llm/loop";
import { PR_REPLY_BODY, PR_THREAD_REPLY_APPENDIX } from "../prompt";
import { COMMENT_LANGUAGE_RULE } from "../prompt";
import {
    getDirectoryTreeTool,
    getFileDiffTool,
    getMergeFileContentTool,
    getPullRequestDetailTool,
    postPullRequestInlineReviewReplyTool,
    searchCodeListTool,
    searchLineByKeywordTool,
} from "../tool";
import { getPullRequestCommentTool } from "../tool/get-pull-request-comment";

export const runPullRequestInlineReviewReply: PullRequestInlineReviewReply = async ({
    provider,
    llmSender,
    prIid,
    reviewId,
    commentId,
    language,
}) => {
    const { baseSha, headSha } = await provider.fetchPullRequestVersion(prIid);
    const { commentList, ...inlineReview } = await provider.fetchPullRequestInlineReview(prIid, reviewId);
    if (!inlineReview) {
        throw new Error(`Review with id ${reviewId} not found`);
    }
    const comment = commentList.find((c) => c.id === commentId);
    if (!comment) {
        throw new Error(`Comment with id ${commentId} not found`);
    }
    const system = [PR_REPLY_BODY, COMMENT_LANGUAGE_RULE, PR_THREAD_REPLY_APPENDIX].join("\n");
    const prompt = JSON.stringify({
        inlineReview,
        pastCommentList: commentList
            .map((c) => ({
                id: c.id,
                body: c.body.length > 100 ? c.body.slice(0, 100) + "..." : c.body,
                author: c.author.length > 20 ? c.author.slice(0, 20) + "..." : c.author,
            }))
            .filter((c) => c.id !== commentId),
        newComment: comment,
    });

    const toolList = [
        getPullRequestCommentTool(provider, prIid),
        getPullRequestDetailTool(provider, prIid),
        getFileDiffTool(provider, prIid),
        searchCodeListTool(provider, headSha),
        searchLineByKeywordTool(provider, headSha),
        getDirectoryTreeTool(provider, headSha),
        getMergeFileContentTool(provider, { baseSha, headSha }),
        postPullRequestInlineReviewReplyTool(provider, prIid, reviewId, comment.author, language),
    ];

    const result = await runAgentLoop(llmSender, system, prompt, `[PR #${prIid}] Inline Review Reply`, {
        toolList,
        requiredToolList: ["post_pull_request_inline_review_reply"],
    });
    return result.usage;
};
