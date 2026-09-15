import type { ActivityTokenUsage } from "@proval/types";
import type { GitProvider } from "../../../git-provider/types";
import type { Workspace } from "../../../git-provider/workspace.js";
import type { LlmSender } from "../../llm/loop";
import type { ReviewHandoff } from "./handoff.schema.js";
import type { ReviewUnit } from "./plan.schema.js";
import { REVIEW_SUB_AGENT_BODY, REVIEW_SUB_AGENT_HANDOFF_FIELDS } from "./sub.prompt.js";
import { FOLLOW_UP_PUSH_SUB_HINT } from "./follow-up.prompt.js";
import { REVIEW_CHECKLIST } from "../prompt";
import { getFileDiffTool, getPushFileDiffTool, submitReviewHandoffTool } from "../tool";
import { getFileContentTool, globTool, grepTool, listDirectoryTool } from "../../shared/tool";
import { runAgentLoop } from "../../llm/loop";
import { ActivityService } from "../../../api/activity/activity.service.js";

export async function runReviewSubAgent(
    provider: GitProvider,
    workspace: Workspace,
    sender: LlmSender,
    pullRequestContextPrompt: string,
    prIid: number,
    reviewUnit: ReviewUnit,
    reviewHandoffList: ReviewHandoff[],
    index: number,
    totalIndex: number,
    activityId: number,
    usePushScope = false,
): Promise<ActivityTokenUsage & { handoff: ReviewHandoff }> {
    const system = [
        REVIEW_SUB_AGENT_BODY,
        REVIEW_SUB_AGENT_HANDOFF_FIELDS,
        usePushScope ? FOLLOW_UP_PUSH_SUB_HINT : null,
        REVIEW_CHECKLIST,
    ]
        .filter(Boolean)
        .join("\n\n");
    const prompt = [pullRequestContextPrompt, `review unit: ${JSON.stringify(reviewUnit)}`].join("\n\n");
    const toolList = [
        usePushScope ? getPushFileDiffTool(workspace) : null,
        getFileDiffTool(workspace),
        grepTool(workspace),
        globTool(workspace),
        listDirectoryTool(workspace),
        getFileContentTool(workspace),
    ];

    const activityService = new ActivityService();

    const result = await runAgentLoop(sender, system, prompt, `[PR #${prIid}] Sub ${index}/${totalIndex}`, {
        toolList,
        requiredToolList: [submitReviewHandoffTool(reviewHandoffList, reviewUnit)],
        activityId,
        onUsage: (stepUsage) => activityService.addTokenUsage(activityId, stepUsage),
    });

    const handoff = reviewHandoffList.find((item) => item.unitId === reviewUnit.id);
    if (!handoff) {
        throw new Error(
            `Sub agent failed to submit handoff for unit ${reviewUnit.id}: ${JSON.stringify({
                stepCount: result.stepCount,
                toolCallCount: result.toolCallCount,
            })}`,
        );
    }

    return {
        handoff,
        ...result.usage,
    };
}
