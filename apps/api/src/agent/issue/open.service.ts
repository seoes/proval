import { logAgent, debug } from "../../util/log";
import { postDevDebugIssueComment } from "../shared/util/debug.js";
import { runAgentLoop } from "../llm/loop";
import { COMMENT_LANGUAGE_RULE } from "../shared/prompt";
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
    try {
        logAgent(activityId, `fetching repository detail`, label);
        const repository = await provider.fetchRepositoryDetail();
        await workspace.loadFromBranch(repository.defaultBranch);

        const repositoryLabelList =
            issueLabelOnOpenEnabled ? await provider.fetchRepositoryLabelList() : [];
        const hasRepositoryLabelList = repositoryLabelList.length > 0;

        const system = [
            ISSUE_BASE_PROMPT,
            buildIssueReplyOnOpenWorkflow(hasRepositoryLabelList),
            COMMENT_LANGUAGE_RULE,
            ...(hasRepositoryLabelList ? [buildRepositoryLabelCatalog(repositoryLabelList)] : []),
        ].join("\n");
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
            ...(hasRepositoryLabelList
                ? [addIssueLabelTool(provider, issueIid, repositoryLabelList)]
                : []),
        ];

        const requiredToolList = [postIssueCommentTool(provider, issueIid, language, activityId)];

        const activityService = new ActivityService();

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
