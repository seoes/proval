import { logAgent, logAgentError, debug } from "../../util/log";
import { postDevDebugIssueComment } from "../shared/util/debug.js";
import { runAgentLoop } from "../llm/loop";
import { COMMENT_LANGUAGE_RULE } from "../shared/prompt";
import { ISSUE_BASE_PROMPT } from "./prompt/issue.prompt.js";
import { ISSUE_REPLY_USER_PROMPT_HEADER, ISSUE_REPLY_WORKFLOW } from "./reply.prompt.js";
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
import { ActivityService } from "../../api/activity/activity.service.js";
import { generateUserPrompt } from "../../util/user-prompt.js";
import { buildAgentInstructionPrompt } from "../pull-request/prompt/agents-md.js";

export const runIssueReply: IssueReply = async ({
    provider,
    workspace,
    llmSender,
    issueIid,
    commentId,
    language,
    activityId,
    userPrompt = null,
}) => {
    const label = `[Issue #${issueIid}] Reply`;
    const emojiTarget = { type: "issue_comment" as const, issueIid, commentId };
    const activityService = new ActivityService();
    try {
        try {
            await provider.addEmoji(emojiTarget, "👀");
        } catch (error) {
            logAgentError(activityId, "add emoji failed", error, label);
        }

        logAgent(activityId, `fetching issue comment ${commentId}`, label);
        const comment = await provider.fetchIssueComment(issueIid, commentId);
        const repository = await provider.fetchRepositoryDetail();
        await workspace.loadFromBranch(repository.defaultBranch);

        const agentInstructionPrompt = await buildAgentInstructionPrompt(workspace, activityId, label);
        const system = [
            ISSUE_BASE_PROMPT,
            ISSUE_REPLY_WORKFLOW,
            COMMENT_LANGUAGE_RULE,
            agentInstructionPrompt,
            generateUserPrompt(ISSUE_REPLY_USER_PROMPT_HEADER, userPrompt),
        ]
            .filter(Boolean)
            .join("\n\n");
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

        const requiredToolList = [postIssueReplyTool(provider, issueIid, comment.author, language, activityId)];

        const result = await runAgentLoop(llmSender, system, prompt, label, {
            toolList,
            requiredToolList,
            activityId,
            onUsage: (stepUsage) => activityService.addTokenUsage(activityId, stepUsage),
        });

        await postDevDebugIssueComment(provider, issueIid, activityId, {
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
        try {
            if (!(await activityService.hasQueuedOrStartedActivity(activityId))) {
                await provider.removeEmoji(emojiTarget, "👀");
            }
        } catch (error) {
            logAgentError(activityId, "remove emoji failed", error, label);
        }
        await workspace.clean();
    }
};
