import { debug } from "../../util/log";
import { postDevDebugIssueComment } from "../shared/util/debug.js";
import { runAgentLoop } from "../llm/loop";
import { COMMENT_LANGUAGE_RULE } from "../shared/prompt";
import { ISSUE_BASE_PROMPT } from "./prompt/issue.prompt.js";
import { ISSUE_REPLY_ON_OPEN_WORKFLOW } from "./open.prompt.js";
import {
    getIssueCommentListTool,
    getIssueDetailTool,
    postIssueCommentTool,
    searchIssueListTool,
    searchPullRequestListTool,
} from "./tool";
import { getFileContentTool, globTool, grepTool, listDirectoryTool } from "../shared/tool";
import type { IssueReplyOnOpen } from "./index.js";

export const runIssueReplyOnOpen: IssueReplyOnOpen = async ({
    provider,
    workspace,
    llmSender,
    issueIid,
    language,
}) => {
    try {
        const repository = await provider.fetchRepositoryDetail();
        await workspace.load({ headRef: repository.defaultBranch });

        const system = [ISSUE_BASE_PROMPT, ISSUE_REPLY_ON_OPEN_WORKFLOW, COMMENT_LANGUAGE_RULE].join("\n");
        const prompt = `Triage the newly opened issue #${issueIid}.`;

        debug(prompt, "prompt");

        const toolList = [
            getIssueDetailTool(provider, issueIid),
            getIssueCommentListTool(provider, issueIid),
            searchIssueListTool(provider),
            searchPullRequestListTool(provider),
            grepTool(workspace),
            globTool(workspace),
            listDirectoryTool(workspace),
            getFileContentTool(workspace),
        ];

        const requiredToolList = [postIssueCommentTool(provider, issueIid, language)];

        const result = await runAgentLoop(llmSender, system, prompt, `[Issue #${issueIid}] Open`, {
            toolList,
            requiredToolList,
        });

        await postDevDebugIssueComment(provider, issueIid, {
            sender: llmSender,
            workflow: "Issue Open",
            usage: result.usage,
            fields: {
                "Issue IID": issueIid,
            },
        });

        return result.usage;
    } finally {
        await workspace.clean();
    }
};
