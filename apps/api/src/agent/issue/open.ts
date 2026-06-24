import type { ActivityTokenUsage } from "@proval/types";
import { runAgentLoop, type LlmSender } from "../llm/loop";
import { COMMENT_LANGUAGE_RULE, ISSUE_BASE_PROMPT, ISSUE_COMMENT_ON_OPEN_WORKFLOW } from "../prompt";
import { generateIssuePrompt } from "./prompt";
import type { GitProvider } from "../../git-provider/types";
import {
    getDirectoryTreeTool,
    getIssueCommentListTool,
    searchIssueListTool,
    getFileContentTool,
    postIssueCommentTool,
    searchCodeListTool,
    searchLineByKeywordTool,
    searchPullRequestListTool,
    getIssueDetailTool,
} from "../tool";

export async function runIssueCommentOnOpen(
    provider: GitProvider,
    llmSender: LlmSender,
    issueIid: number,
    language: string,
): Promise<ActivityTokenUsage> {
    const repository = await provider.fetchRepositoryDetail();
    const system = [ISSUE_BASE_PROMPT, ISSUE_COMMENT_ON_OPEN_WORKFLOW, COMMENT_LANGUAGE_RULE].join("\n");
    const prompt = await generateIssuePrompt(provider, issueIid);
    const toolList = [
        getIssueDetailTool(provider, issueIid),
        getIssueCommentListTool(provider, issueIid),
        searchIssueListTool(provider),
        searchPullRequestListTool(provider),
        searchCodeListTool(provider, repository.defaultBranch),
        searchLineByKeywordTool(provider, repository.defaultBranch),
        getDirectoryTreeTool(provider, repository.defaultBranch),
        getFileContentTool(provider, repository.defaultBranch),
        postIssueCommentTool(provider, issueIid, language),
    ];
    const result = await runAgentLoop(llmSender, system, prompt, `Issue #${issueIid} - Comment On Open`, {
        toolList,
    });

    return result.usage;
}
