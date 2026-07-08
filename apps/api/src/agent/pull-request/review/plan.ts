import type { ActivityTokenUsage } from "@proval/types";
import type { GitProvider, GitTree } from "../../../git-provider/types";
import type { LlmSender } from "../../llm/loop";
import type { ReviewUnit, SkippedFile } from "../schema/deep-research.schema";
import { DEEP_REVIEW_PLAN, FILE_COVERAGE_RULE } from "../prompt";
import { appendReviewUnitTool, getFileDiffTool, skipFileTool } from "../tool";
import {
    getDirectoryTreeTool,
    getMergeFileContentTool,
    searchCodeListTool,
    searchFileByNameTool,
    searchLineByKeywordTool,
} from "../../shared/tool";
import { runAgentLoop } from "../../llm/loop";

export async function runReviewPlanAgent(
    provider: GitProvider,
    sender: LlmSender,
    pullRequestContextPrompt: string,
    prIid: number,
    baseSha: string,
    headSha: string,
    fileList: GitTree[],
): Promise<ActivityTokenUsage & { reviewUnitList: ReviewUnit[] }> {
    const reviewUnitList: ReviewUnit[] = [];
    const skippedFileList: SkippedFile[] = [];

    const system = [DEEP_REVIEW_PLAN, FILE_COVERAGE_RULE].join("\n\n");
    const toolList = [
        getFileDiffTool(provider, prIid),
        searchCodeListTool(provider, headSha),
        searchLineByKeywordTool(provider, headSha),
        searchFileByNameTool(fileList),
        getDirectoryTreeTool(fileList),
        getMergeFileContentTool(provider, { baseSha, headSha }),
        appendReviewUnitTool(reviewUnitList),
        skipFileTool(skippedFileList),
    ];

    const result = await runAgentLoop(sender, system, pullRequestContextPrompt, `[PR #${prIid}] Plan`, {
        toolList,
    });

    return {
        reviewUnitList,
        ...result.usage,
    };
}
