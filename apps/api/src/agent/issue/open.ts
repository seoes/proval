import { debug } from "../../util/log";
import { runAgentLoop } from "../llm/loop";
import { COMMENT_LANGUAGE_RULE } from "../shared/prompt";
import { ISSUE_BASE_PROMPT, ISSUE_REPLY_ON_OPEN_WORKFLOW } from "./prompt";
import {
    getIssueCommentListTool,
    getIssueDetailTool,
    postIssueCommentTool,
    searchIssueListTool,
    searchPullRequestListTool,
} from "./tool";
import { getDirectoryTreeTool, getFileContentTool, searchCodeListTool, searchLineByKeywordTool } from "../shared/tool";
import type { IssueReplyOnOpen } from "./index.js";

export const runIssueReplyOnOpen: IssueReplyOnOpen = async ({ provider, llmSender, issueIid, language }) => {
    const repository = await provider.fetchRepositoryDetail();

    const system = [ISSUE_BASE_PROMPT, ISSUE_REPLY_ON_OPEN_WORKFLOW, COMMENT_LANGUAGE_RULE].join("\n");
    const prompt = `Triage the newly opened issue #${issueIid}.`;

    debug(prompt, "prompt");

    const toolList = [
        getIssueDetailTool(provider, issueIid),
        getIssueCommentListTool(provider, issueIid),
        searchIssueListTool(provider),
        searchPullRequestListTool(provider),
        searchCodeListTool(provider, repository.defaultBranch),
        searchLineByKeywordTool(provider, repository.defaultBranch),
        getDirectoryTreeTool(provider, repository.defaultBranch),
        getFileContentTool(provider, repository.defaultBranch),
    ];

    const requiredToolList = [postIssueCommentTool(provider, issueIid, language)];

    const result = await runAgentLoop(llmSender, system, prompt, `[Issue #${issueIid}] Open`, {
        toolList,
        requiredToolList,
    });

    return result.usage;
};
