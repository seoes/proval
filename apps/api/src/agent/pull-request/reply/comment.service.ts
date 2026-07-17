import { activityLog } from "../../../util/activity-log.js";
import { debug } from "../../../util/log";
import { postDevDebugPullRequestComment } from "../../shared/util/debug.js";
import { runAgentLoop } from "../../llm/loop";
import { COMMENT_LANGUAGE_RULE } from "../../shared/prompt";
import { PR_REPLY_BODY, PR_REPLY_WORKFLOW } from "./prompt/reply.prompt.js";
import {
    getChangedFileListTool,
    getPullRequestCommentListTool,
    getPullRequestCommentTool,
    getPullRequestDetailTool,
    getFileDiffTool,
    postPullRequestReplyTool,
} from "../tool";
import { getFileContentTool, globTool, grepTool, listDirectoryTool } from "../../shared/tool";
import type { PullRequestCommentReply } from "../index.js";

export const runPullRequestCommentReply: PullRequestCommentReply = async ({
    provider,
    workspace,
    llmSender,
    prIid,
    commentId,
    language,
    activityId,
}) => {
    try {
        activityLog(activityId, "info", "context", `fetching PR comment ${commentId} on !${prIid}`);
        const comment = await provider.fetchPullRequestComment(prIid, commentId);
        const { headSha } = await provider.fetchPullRequestVersion(prIid);
        activityLog(activityId, "info", "context", `version ready head=${headSha.slice(0, 12)}…`);
        await workspace.load({ headRef: headSha, prIid, activityId });

        const system = [PR_REPLY_BODY, PR_REPLY_WORKFLOW, COMMENT_LANGUAGE_RULE].join("\n");
        const prompt = `Reply to the new conversation comment on PR #${prIid}. (commentId: ${commentId})`;

        debug(prompt, "prompt");

        const toolList = [
            getPullRequestCommentTool(provider, prIid),
            getPullRequestCommentListTool(provider, prIid),
            getPullRequestDetailTool(provider, prIid),
            getChangedFileListTool(workspace),
            getFileDiffTool(workspace),
            grepTool(workspace),
            globTool(workspace),
            listDirectoryTool(workspace),
            getFileContentTool(workspace),
        ];

        const requiredToolList = [postPullRequestReplyTool(provider, prIid, comment.author, language)];

        const result = await runAgentLoop(llmSender, system, prompt, `[PR #${prIid}] Reply`, {
            toolList,
            requiredToolList,
            activityId,
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
    } finally {
        await workspace.clean();
    }
};
