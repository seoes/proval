import type { ActivityTokenUsage } from "@proval/types";
import type { GitProvider } from "../../../git-provider/types";
import type { Workspace } from "../../../git-provider/workspace.js";
import type { LlmSender } from "../../llm/loop";
import type { ReviewUnit } from "./plan.schema.js";
import { REVIEW_SUB_AGENT_BODY, REVIEW_SUB_AGENT_OUTPUT_FORMAT } from "./sub.prompt.js";
import { REVIEW_CHECKLIST } from "../prompt";
import { getFileDiffTool } from "../tool";
import { getFileContentTool, globTool, grepTool, listDirectoryTool } from "../../shared/tool";
import { runAgentLoop } from "../../llm/loop";

export async function runReviewSubAgent(
    provider: GitProvider,
    workspace: Workspace,
    sender: LlmSender,
    pullRequestContextPrompt: string,
    prIid: number,
    reviewUnit: ReviewUnit,
    index: number,
    totalIndex: number,
): Promise<ActivityTokenUsage & { finalMessage: string }> {
    const system = [REVIEW_SUB_AGENT_BODY, REVIEW_CHECKLIST, REVIEW_SUB_AGENT_OUTPUT_FORMAT].join("\n\n");
    const prompt = [pullRequestContextPrompt, `review unit: ${JSON.stringify(reviewUnit)}`].join("\n\n");
    const toolList = [
        getFileDiffTool(workspace),
        grepTool(workspace),
        globTool(workspace),
        listDirectoryTool(workspace),
        getFileContentTool(workspace),
    ];
    const result = await runAgentLoop(sender, system, prompt, `[PR #${prIid}] Sub ${index}/${totalIndex}`, {
        toolList,
    });

    if (!result.finalMessage) {
        throw new Error("Sub agent failed to return final message");
    }

    return {
        finalMessage: result.finalMessage,
        ...result.usage,
    };
}
