import type { ActivityTokenUsage } from "@proval/types";
import type { GitProvider } from "../../../git-provider/types";
import type { Workspace } from "../../../git-provider/workspace.js";
import { runAgentLoop, type LlmSender } from "../../llm/loop";
import { INLINE_DISABLED, INLINE_ENABLED, SEVERITY } from "../prompt";
import { COMMENT_LANGUAGE_RULE } from "../../shared/prompt";
import { WRITING_WORKFLOW } from "./writing.prompt.js";
import {
    createMultiLineCommentTool,
    createSingleLineCommentTool,
    getFileDiffTool,
    postPullRequestCommentTool,
} from "../tool";
import { getFileContentTool, globTool, grepTool, listDirectoryTool } from "../../shared/tool";

export async function runReviewWritingAgent(
    provider: GitProvider,
    workspace: Workspace,
    sender: LlmSender,
    pullRequestContextPrompt: string,
    prIid: number,
    baseSha: string,
    headSha: string,
    startSha: string,
    reviewResultList: string[],
    isInlineReview: boolean,
    language: string,
): Promise<ActivityTokenUsage> {
    const system = [
        WRITING_WORKFLOW,
        SEVERITY,
        isInlineReview ? INLINE_ENABLED : INLINE_DISABLED,
        COMMENT_LANGUAGE_RULE,
    ].join("\n\n");
    const prompt = [
        pullRequestContextPrompt,
        `Review unit handoffs (plain text, one block per sub agent, each includes Findings and Good Points).\n\n${reviewResultList.join("\n\n")}`,
    ].join("\n\n");

    const result = await runAgentLoop(sender, system, prompt, `[PR #${prIid}] Writing`, {
        toolList: [
            getFileDiffTool(workspace),
            grepTool(workspace),
            globTool(workspace),
            listDirectoryTool(workspace),
            getFileContentTool(workspace),
            isInlineReview ? createSingleLineCommentTool(provider, prIid, language, baseSha, headSha, startSha) : null,
            isInlineReview ? createMultiLineCommentTool(provider, prIid, language, baseSha, headSha, startSha) : null,
        ],
        requiredToolList: [postPullRequestCommentTool(provider, prIid, language)],
    });

    return result.usage;
}
