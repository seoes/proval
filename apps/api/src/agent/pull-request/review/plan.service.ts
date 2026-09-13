import type { ActivityTokenUsage } from "@proval/types";
import type { GitProvider } from "../../../git-provider/types";
import type { Workspace } from "../../../git-provider/workspace.js";
import type { LlmSender } from "../../llm/loop";
import type { ReviewUnit, SkippedFile } from "./plan.schema.js";
import { REVIEW_PLAN } from "./plan.prompt.js";
import { FOLLOW_UP_PLAN_HINT, FOLLOW_UP_PUSH_PLAN_HINT } from "./follow-up.prompt.js";
import { FILE_COVERAGE_RULE } from "../prompt";
import {
    appendReviewUnitTool,
    getChangedFileListTool,
    getFileDiffTool,
    getPullRequestCommentListTool,
    getPullRequestCommentTool,
    getPullRequestInlineReviewCommentTool,
    getPullRequestInlineReviewListTool,
    getPushChangedFileListTool,
    getPushFileDiffTool,
    skipFileTool,
} from "../tool";
import { getFileContentTool, globTool, grepTool, listDirectoryTool } from "../../shared/tool";
import { runAgentLoop } from "../../llm/loop";
import { ActivityService } from "../../../api/activity/activity.service.js";

export async function runReviewPlanAgent(
    provider: GitProvider,
    workspace: Workspace,
    sender: LlmSender,
    pullRequestContextPrompt: string,
    prIid: number,
    activityId: number,
    isFollowUpReview = false,
    usePushScope = false,
): Promise<ActivityTokenUsage & { reviewUnitList: ReviewUnit[] }> {
    const reviewUnitList: ReviewUnit[] = [];
    const skippedFileList: SkippedFile[] = [];

    const system = [
        REVIEW_PLAN,
        isFollowUpReview ? FOLLOW_UP_PLAN_HINT : null,
        usePushScope ? FOLLOW_UP_PUSH_PLAN_HINT : null,
        FILE_COVERAGE_RULE,
    ]
        .filter(Boolean)
        .join("\n\n");

    const toolList = [
        getFileDiffTool(workspace),
        usePushScope ? getPushChangedFileListTool(workspace) : null,
        usePushScope ? getPushFileDiffTool(workspace) : null,
        usePushScope ? getChangedFileListTool(workspace) : null,
        grepTool(workspace),
        globTool(workspace),
        listDirectoryTool(workspace),
        getFileContentTool(workspace),
        isFollowUpReview ? getPullRequestCommentListTool(provider, prIid) : null,
        isFollowUpReview ? getPullRequestCommentTool(provider, prIid) : null,
        isFollowUpReview ? getPullRequestInlineReviewListTool(provider, prIid) : null,
        isFollowUpReview ? getPullRequestInlineReviewCommentTool(provider, prIid) : null,
        appendReviewUnitTool(reviewUnitList),
        skipFileTool(skippedFileList),
    ];

    const activityService = new ActivityService();

    const result = await runAgentLoop(sender, system, pullRequestContextPrompt, `[PR #${prIid}] Plan`, {
        toolList,
        activityId,
        onUsage: (stepUsage) => activityService.addTokenUsage(activityId, stepUsage),
    });

    return {
        reviewUnitList,
        ...result.usage,
    };
}
