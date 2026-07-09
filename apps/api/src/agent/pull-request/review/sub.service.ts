import type { ActivityTokenUsage } from "@proval/types";
import type { GitProvider, GitTree } from "../../../git-provider/types";
import type { LlmSender } from "../../llm/loop";
import type { ReviewUnit } from "./plan.schema.js";
import { REVIEW_SUB_AGENT_BODY, REVIEW_SUB_AGENT_OUTPUT_FORMAT } from "./sub.prompt.js";
import { REVIEW_CHECKLIST } from "../prompt";
import { getFileDiffTool } from "../tool";
import {
    getDirectoryTreeTool,
    getMergeFileContentTool,
    searchCodeListTool,
    searchFileByNameTool,
    searchLineByKeywordTool,
} from "../../shared/tool";
import { runAgentLoop } from "../../llm/loop";

export async function runReviewSubAgent(
    provider: GitProvider,
    sender: LlmSender,
    pullRequestContextPrompt: string,
    prIid: number,
    baseSha: string,
    headSha: string,
    reviewUnit: ReviewUnit,
    index: number,
    totalIndex: number,
    fileList: GitTree[],
): Promise<ActivityTokenUsage & { finalMessage: string }> {
    const system = [REVIEW_SUB_AGENT_BODY, REVIEW_CHECKLIST, REVIEW_SUB_AGENT_OUTPUT_FORMAT].join("\n\n");
    const prompt = [pullRequestContextPrompt, `review unit: ${JSON.stringify(reviewUnit)}`].join("\n\n");
    const toolList = [
        getFileDiffTool(provider, prIid),
        searchCodeListTool(provider, headSha),
        searchLineByKeywordTool(provider, headSha),
        searchFileByNameTool(fileList),
        getDirectoryTreeTool(fileList),
        getMergeFileContentTool(provider, { baseSha, headSha }),
    ];
    const result = await runAgentLoop(sender, system, prompt, `[PR #${prIid}] Sub ${index}/${totalIndex}`, {
        toolList,
    });

    if (!result.finalMessage) {
        throw new Error("Sub agent failed to return final message");
    }

    console.log(result.finalMessage);

    return {
        finalMessage: result.finalMessage,
        ...result.usage,
    };
}
