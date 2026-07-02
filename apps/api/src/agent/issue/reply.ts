import type { ActivityTokenUsage } from "@proval/types";
import type { GitProvider } from "../../git-provider/types";
import { runAgentLoop, type LlmSender } from "../llm/loop";
import { COMMENT_LANGUAGE_RULE, ISSUE_BASE_PROMPT, ISSUE_REPLY_WORKFLOW } from "../prompt";
import { generateIssuePrompt } from "./prompt";
import {
    getDirectoryTreeTool,
    getFileContentTool,
    getIssueCommentListTool,
    getIssueDetailTool,
    postIssueReplyTool,
    searchCodeListTool,
    searchIssueListTool,
    searchLineByKeywordTool,
    searchPullRequestListTool,
} from "../tool";

export async function runIssueReply(
    provider: GitProvider,
    llmSender: LlmSender,
    issueIid: number,
    commenterUsername: string,
    commentBody: string,
    language: string,
): Promise<ActivityTokenUsage> {
    const repository = await provider.fetchRepositoryDetail();
    const system = [ISSUE_BASE_PROMPT, ISSUE_REPLY_WORKFLOW, COMMENT_LANGUAGE_RULE].join("\n");
    const prompt = [
        await generateIssuePrompt(provider, issueIid),
        `Commenter Username: ${commenterUsername}`,
        `Comment Body: ${commentBody}`,
    ].join("\n\n");

    const toolList = [
        getIssueDetailTool(provider, issueIid),
        getIssueCommentListTool(provider, issueIid),
        searchIssueListTool(provider),
        searchPullRequestListTool(provider),
        searchCodeListTool(provider, repository.defaultBranch),
        searchLineByKeywordTool(provider, repository.defaultBranch),
        getDirectoryTreeTool(provider, repository.defaultBranch),
        getFileContentTool(provider, repository.defaultBranch),
        postIssueReplyTool(provider, issueIid, commenterUsername, language),
    ];

    const result = await runAgentLoop(llmSender, system, prompt, `[Issue #${issueIid}] Reply`, {
        toolList,
    });

    return result.usage;
}
