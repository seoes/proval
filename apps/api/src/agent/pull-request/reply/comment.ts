import { debug } from "../../../util/log";
import { postDevDebugPullRequestComment } from "../../dev-debug-comment.js";
import { runAgentLoop } from "../../llm/loop";
import { COMMENT_LANGUAGE_RULE } from "../../shared/prompt";
import { PR_REPLY_BODY, PR_REPLY_WORKFLOW } from "../prompt";
import {
    getChangedFileListTool,
    getPullRequestCommentListTool,
    getPullRequestCommentTool,
    getPullRequestDetailTool,
    getFileDiffTool,
    postPullRequestReplyTool,
} from "../tool";
import {
    getDirectoryTreeTool,
    getMergeFileContentTool,
    searchCodeListTool,
    searchLineByKeywordTool,
} from "../../shared/tool";
import type { PullRequestCommentReply } from "../index.js";

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
        getChangedFileListTool(provider, prIid),
        getFileDiffTool(provider, prIid),
        searchCodeListTool(provider, headSha),
        searchLineByKeywordTool(provider, headSha),
        getDirectoryTreeTool(provider, headSha),
        getMergeFileContentTool(provider, { baseSha, headSha }),
    ];

    const requiredToolList = [postPullRequestReplyTool(provider, prIid, comment.author, language)];

    const result = await runAgentLoop(llmSender, system, prompt, `[PR #${prIid}] Reply`, {
        toolList,
        requiredToolList,
    });

    await postDevDebugPullRequestComment(provider, prIid, {
        sender: llmSender,
        workflow: "PR Reply",
        usage: result.usage,
        fields: {
            "Pull Request IID": prIid,
            "Comment ID": commentId,
        },
    });

    return result.usage;
};
