import type { PullRequestInlineReviewReply } from "../index.js";
import { postDevDebugPullRequestComment } from "../../shared/util/debug.js";
import { debug } from "../../../util/log";
import { runAgentLoop } from "../../llm/loop";
import { COMMENT_LANGUAGE_RULE } from "../../shared/prompt";
import { PR_INLINE_REVIEW_REPLY_APPENDIX, PR_REPLY_BODY, PR_REPLY_WORKFLOW } from "../prompt";
import {
    getChangedFileListTool,
    getPullRequestCommentListTool,
    getPullRequestDetailTool,
    getPullRequestInlineReviewCommentTool,
    getPullRequestInlineReviewListTool,
    getFileDiffTool,
    postPullRequestInlineReviewReplyTool,
} from "../tool";
import {
    getDirectoryTreeTool,
    getMergeFileContentTool,
    searchCodeListTool,
    searchFileByNameTool,
    searchLineByKeywordTool,
} from "../../shared/tool";

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
    const fileList = await provider.fetchDirectoryTree("", headSha, true);

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
        getChangedFileListTool(provider, prIid),
        getFileDiffTool(provider, prIid),
        searchCodeListTool(provider, headSha),
        searchLineByKeywordTool(provider, headSha),
        searchFileByNameTool(fileList),
        getDirectoryTreeTool(fileList),
        getMergeFileContentTool(provider, { baseSha, headSha }),
    ];

    const requiredToolList = [
        postPullRequestInlineReviewReplyTool(provider, prIid, inlineReviewId, comment.author, language),
    ];

    const result = await runAgentLoop(llmSender, system, prompt, `[PR #${prIid}] Inline Review Reply`, {
        toolList,
        requiredToolList,
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
};
