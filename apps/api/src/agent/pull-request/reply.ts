import { debug } from "../../util/log";
import { runAgentLoop } from "../llm/loop";
import { PR_REPLY_BODY } from "../prompt";
import { COMMENT_LANGUAGE_RULE } from "../prompt";
import {
    getDirectoryTreeTool,
    getFileDiffTool,
    getMergeFileContentTool,
    getPullRequestDetailTool,
    postPullRequestReplyTool,
    searchCodeListTool,
    searchLineByKeywordTool,
    getPullRequestCommentTool,
    getPullRequestCommentListTool,
} from "../tool";
import type { PullRequestCommentReply } from "./index.js";

function truncateCommentBody(body: string): string {
    return body.length > 100 ? body.slice(0, 100) + "..." : body;
}

function truncateAuthor(author: string): string {
    return author.length > 20 ? author.slice(0, 20) + "..." : author;
}

export const runPullRequestCommentReply: PullRequestCommentReply = async ({
    provider,
    llmSender,
    prIid,
    commentId,
    language,
}) => {
    const { baseSha, headSha } = await provider.fetchPullRequestVersion(prIid);
    const [commentList, inlineReviewList] = await Promise.all([
        provider.fetchPullRequestCommentList(prIid),
        provider.fetchPullRequestInlineReviewList(prIid),
    ]);
    const comment = commentList.find((c) => c.id === commentId);
    if (!comment) {
        throw new Error(`Comment with id ${commentId} not found`);
    }
    const system = [PR_REPLY_BODY, COMMENT_LANGUAGE_RULE].join("\n");

    const prompt = JSON.stringify({
        pastCommentList: commentList
            .filter((c) => c.id !== commentId)
            .map((c) => ({
                id: c.id,
                body: truncateCommentBody(c.body),
                author: truncateAuthor(c.author),
            })),
        pastInlineReviewList: inlineReviewList.map((review) => ({
            id: review.id,
            path: review.path,
            commentList: review.commentList.map((c) => ({
                id: c.id,
                body: truncateCommentBody(c.body),
                author: truncateAuthor(c.author),
            })),
        })),
        newComment: comment,
    });

    debug(prompt, "prompt");

    const toolList = [
        getPullRequestCommentTool(provider, prIid),
        getPullRequestCommentListTool(provider, prIid),
        getPullRequestDetailTool(provider, prIid),
        getFileDiffTool(provider, prIid),
        searchCodeListTool(provider, headSha),
        searchLineByKeywordTool(provider, headSha),
        getDirectoryTreeTool(provider, headSha),
        getMergeFileContentTool(provider, { baseSha, headSha }),
        postPullRequestReplyTool(provider, prIid, comment.author, language),
    ];

    const result = await runAgentLoop(llmSender, system, prompt, `[PR #${prIid}] Reply`, {
        toolList,
        requiredToolList: ["post_reply_comment"],
    });

    return result.usage;
};
