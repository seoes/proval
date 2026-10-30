import { logAgent, debug } from "../../util/log";
import { postDevDebugIssueComment } from "../shared/util/debug.js";
import { runAgentLoop } from "../llm/loop";
import { buildAuthorMentionPolicy, COMMENT_LANGUAGE_RULE } from "../shared/prompt";
import { ISSUE_BASE_PROMPT } from "./prompt/issue.prompt.js";
import { buildIssueReplyOnOpenWorkflow, buildRepositoryLabelCatalog } from "./open.prompt.js";
import {
    addIssueLabelTool,
    getIssueCommentListTool,
    getIssueDetailTool,
    postIssueCommentTool,
    searchIssueListTool,
    searchPullRequestListTool,
} from "./tool";
import { getFileContentTool, globTool, grepTool, listDirectoryTool } from "../shared/tool";
import type { IssueReplyOnOpen } from "./index.js";
import { ActivityService } from "../../api/activity/activity.service.js";
import { buildAgentInstructionPrompt } from "../pull-request/prompt/agents-md.js";

export const runIssueReplyOnOpen: IssueReplyOnOpen = async ({
    provider,
    workspace,
    llmSender,
    issueIid,
    language,
    issueLabelOnOpenEnabled,
    activityId,
}) => {
    const label = `[Issue #${issueIid}] Open`;
    const activityService = new ActivityService();
    try {
        logAgent(activityId, `fetching repository detail`, label);
        const repository = await provider.fetchRepositoryDetail();
        const issue = await provider.fetchIssueDetail(issueIid);
        await workspace.loadFromBranch(repository.defaultBranch);

        const repositoryLabelList = issueLabelOnOpenEnabled ? await provider.fetchRepositoryLabelList() : [];
        const hasRepositoryLabelList = repositoryLabelList.length > 0;

        const agentInstructionPrompt = await buildAgentInstructionPrompt(workspace, activityId, label);
        const system = [
            ISSUE_BASE_PROMPT,
            buildIssueReplyOnOpenWorkflow(hasRepositoryLabelList),
            COMMENT_LANGUAGE_RULE,
            buildAuthorMentionPolicy(issue.author, "review"),
            ...(hasRepositoryLabelList ? [buildRepositoryLabelCatalog(repositoryLabelList)] : []),
            agentInstructionPrompt,
        ]
            .filter(Boolean)
            .join("\n");
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
            ...(hasRepositoryLabelList ? [addIssueLabelTool(provider, issueIid, repositoryLabelList)] : []),
        ];

        const requiredToolList = [postIssueCommentTool(provider, issueIid, language, activityId)];

        const result = await runAgentLoop(llmSender, system, prompt, label, {
            toolList,
            requiredToolList,
            activityId,
            onUsage: (stepUsage) => activityService.addTokenUsage(activityId, stepUsage),
        });

        await postDevDebugIssueComment(provider, issueIid, activityId, {
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
