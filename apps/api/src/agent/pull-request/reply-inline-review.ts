import type { PullRequestInlineReviewReply } from ".";
import { debug } from "../../util/log";
import { runAgentLoop } from "../llm/loop";
import { PR_REPLY_BODY, PR_INLINE_REVIEW_REPLY_APPENDIX } from "../prompt";
import { COMMENT_LANGUAGE_RULE } from "../prompt";
import {
    getDirectoryTreeTool,
    getFileDiffTool,
    getMergeFileContentTool,
    getPullRequestDetailTool,
    postPullRequestInlineReviewReplyTool,
    searchCodeListTool,
    searchLineByKeywordTool,
    getPullRequestInlineReviewCommentTool,
    getPullRequestInlineReviewListTool,
} from "../tool";

function truncateCommentBody(body: string): string {
    return body.length > 100 ? body.slice(0, 100) + "..." : body;
}

function truncateAuthor(author: string): string {
    return author.length > 20 ? author.slice(0, 20) + "..." : author;
}

export const runPullRequestInlineReviewReply: PullRequestInlineReviewReply = async ({
    provider,
    llmSender,
    prIid,
    inlineReviewId,
    commentId,
    language,
}) => {
    const { baseSha, headSha } = await provider.fetchPullRequestVersion(prIid);
    const [{ commentList, ...inlineReview }, conversationCommentList] = await Promise.all([
        provider.fetchPullRequestInlineReview(prIid, inlineReviewId),
        provider.fetchPullRequestCommentList(prIid),
    ]);
    const comment = commentList.find((c) => c.id === commentId);
    if (!comment) {
        throw new Error(`Comment with id ${commentId} not found`);
    }
    const system = [PR_REPLY_BODY, COMMENT_LANGUAGE_RULE, PR_INLINE_REVIEW_REPLY_APPENDIX].join("\n");
    const prompt = JSON.stringify({
        inlineReview: {
            ...inlineReview,
            commentList: commentList
                .filter((c) => c.id !== commentId)
                .map((c) => ({
                    id: c.id,
                    body: truncateCommentBody(c.body),
                    author: truncateAuthor(c.author),
                })),
        },
        pastCommentList: conversationCommentList.map((c) => ({
            id: c.id,
            body: truncateCommentBody(c.body),
            author: truncateAuthor(c.author),
        })),
        newComment: comment,
    });

    debug(prompt, "prompt");

    const toolList = [
        getPullRequestInlineReviewCommentTool(provider, prIid),
        getPullRequestInlineReviewListTool(provider, prIid),
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
