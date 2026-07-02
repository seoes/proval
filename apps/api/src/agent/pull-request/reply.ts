import { debug } from "../../util/log";
import { runAgentLoop } from "../llm/loop";
import { PR_REPLY_BODY, PR_REPLY_WORKFLOW } from "../prompt";
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

export const runPullRequestCommentReply: PullRequestCommentReply = async ({
    provider,
    llmSender,
    prIid,
    commentId,
    language,
}) => {
    const comment = await provider.fetchPullRequestComment(prIid, commentId);
    const { baseSha, headSha } = await provider.fetchPullRequestVersion(prIid);

    const system = [PR_REPLY_BODY, PR_REPLY_WORKFLOW, COMMENT_LANGUAGE_RULE].join("\n");
    const prompt = `Reply to the new conversation comment on PR #${prIid}. (commentId: ${commentId})`;

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
