import { debug } from "../../util/log";
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
import { getDirectoryTreeTool, getFileContentTool, searchCodeListTool, searchFileByNameTool, searchLineByKeywordTool } from "../shared/tool";
import type { IssueReply } from "./index.js";

export const runIssueReply: IssueReply = async ({ provider, llmSender, issueIid, commentId, language }) => {
    const comment = await provider.fetchIssueComment(issueIid, commentId);
    const repository = await provider.fetchRepositoryDetail();
    const fileList = await provider.fetchDirectoryTree("", repository.defaultBranch, true);

    const system = [ISSUE_BASE_PROMPT, ISSUE_REPLY_WORKFLOW, COMMENT_LANGUAGE_RULE].join("\n");
    const prompt = `Reply to the new comment on Issue #${issueIid}. (commentId: ${commentId})`;

    debug(prompt, "prompt");

    const toolList = [
        getIssueCommentTool(provider, issueIid),
        getIssueCommentListTool(provider, issueIid),
        getIssueDetailTool(provider, issueIid),
        searchIssueListTool(provider),
        searchPullRequestListTool(provider),
        searchCodeListTool(provider, repository.defaultBranch),
        searchLineByKeywordTool(provider, repository.defaultBranch),
        searchFileByNameTool(fileList),
        getDirectoryTreeTool(fileList),
        getFileContentTool(provider, repository.defaultBranch),
    ];

    const requiredToolList = [postIssueReplyTool(provider, issueIid, comment.author, language)];

    const result = await runAgentLoop(llmSender, system, prompt, `[Issue #${issueIid}] Reply`, {
        toolList,
        requiredToolList,
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
};
