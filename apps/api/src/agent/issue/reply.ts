import { debug } from "../../util/log";
import { runAgentLoop } from "../llm/loop";
import { COMMENT_LANGUAGE_RULE, ISSUE_BASE_PROMPT, ISSUE_REPLY_WORKFLOW } from "../prompt";
import {
    getDirectoryTreeTool,
    getFileContentTool,
    getIssueCommentListTool,
    getIssueCommentTool,
    getIssueDetailTool,
    postIssueReplyTool,
    searchCodeListTool,
    searchIssueListTool,
    searchLineByKeywordTool,
    searchPullRequestListTool,
} from "../tool";
import type { IssueReply } from "./index.js";

export const runIssueReply: IssueReply = async ({ provider, llmSender, issueIid, commentId, language }) => {
    const comment = await provider.fetchIssueComment(issueIid, commentId);
    const repository = await provider.fetchRepositoryDetail();

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
        getDirectoryTreeTool(provider, repository.defaultBranch),
        getFileContentTool(provider, repository.defaultBranch),
        postIssueReplyTool(provider, issueIid, comment.author, language),
    ];

    const result = await runAgentLoop(llmSender, system, prompt, `[Issue #${issueIid}] Reply`, {
        toolList,
        requiredToolList: ["post_issue_reply"],
    });

    return result.usage;
};
