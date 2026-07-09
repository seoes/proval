import type { ActivityTokenUsage } from "@proval/types";
import type { GitProvider, GitTree } from "../../../git-provider/types";
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
import {
    getDirectoryTreeTool,
    searchLineByKeywordTool,
    searchCodeListTool,
    searchFileByNameTool,
    getMergeFileContentTool,
} from "../../shared/tool";

export async function runReviewWritingAgent(
    provider: GitProvider,
    sender: LlmSender,
    pullRequestContextPrompt: string,
    prIid: number,
    baseSha: string,
    headSha: string,
    startSha: string,
    reviewResultList: string[],
    isInlineReview: boolean,
    language: string,
    fileList: GitTree[],
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
            getFileDiffTool(provider, prIid),
            searchCodeListTool(provider, headSha),
            searchLineByKeywordTool(provider, headSha),
            searchFileByNameTool(fileList),
            getDirectoryTreeTool(fileList),
            getMergeFileContentTool(provider, { baseSha, headSha }),
            isInlineReview ? createSingleLineCommentTool(provider, prIid, language, baseSha, headSha, startSha) : null,
            isInlineReview ? createMultiLineCommentTool(provider, prIid, language, baseSha, headSha, startSha) : null,
        ],
        requiredToolList: [postPullRequestCommentTool(provider, prIid, language)],
    });

    return result.usage;
}
