import { logAgent, debug } from "../../util/log";
import { postDevDebugIssueComment } from "../shared/util/debug.js";
import { runAgentLoop } from "../llm/loop";
import { COMMENT_LANGUAGE_RULE } from "../shared/prompt";
import { ISSUE_BASE_PROMPT } from "./prompt/issue.prompt.js";
import { ISSUE_REPLY_WORKFLOW } from "./reply.prompt.js";
import {
    getIssueCommentListTool,
    getIssueCommentTool,
    getIssueDetailTool,
    postIssueReplyTool,
    searchIssueListTool,
    searchPullRequestListTool,
} from "./tool";
import { getFileContentTool, globTool, grepTool, listDirectoryTool } from "../shared/tool";
import type { IssueReply } from "./index.js";

export const runIssueReply: IssueReply = async ({
    provider,
    workspace,
    llmSender,
    issueIid,
    commentId,
    language,
    activityId,
}) => {
    const label = `[Issue #${issueIid}] Reply`;
    try {
        logAgent(activityId, `fetching issue comment ${commentId}`, label);
        const comment = await provider.fetchIssueComment(issueIid, commentId);
        const repository = await provider.fetchRepositoryDetail();
        await workspace.load({ headRef: repository.defaultBranch, activityId, label });

        const system = [ISSUE_BASE_PROMPT, ISSUE_REPLY_WORKFLOW, COMMENT_LANGUAGE_RULE].join("\n");
        const prompt = `Reply to the new comment on Issue #${issueIid}. (commentId: ${commentId})`;

        debug(prompt, "prompt");

        const toolList = [
            getIssueCommentTool(provider, issueIid),
            getIssueCommentListTool(provider, issueIid),
            getIssueDetailTool(provider, issueIid),
            searchIssueListTool(provider),
            searchPullRequestListTool(provider),
            grepTool(workspace),
            globTool(workspace),
            listDirectoryTool(workspace),
            getFileContentTool(workspace),
        ];

        const requiredToolList = [postIssueReplyTool(provider, issueIid, comment.author, language)];

        const result = await runAgentLoop(llmSender, system, prompt, label, {
            toolList,
            requiredToolList,
            activityId,
        });

        await postDevDebugIssueComment(provider, issueIid, {
            sender: llmSender,
            workflow: "Issue Reply",
            usage: result.usage,
            fields: {
                "Issue IID": issueIid,
                "Comment ID": commentId,
            },
        });

        return result.usage;
    } finally {
        await workspace.clean();
    }
};
