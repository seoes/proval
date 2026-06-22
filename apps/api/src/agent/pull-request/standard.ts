import type { ActivityTokenUsage } from "@proval/types";
import type { GitProvider } from "../../git-provider/types";
import { runAgentLoop, type LlmSender } from "../llm/loop";
import {
    COMMENT_LANGUAGE_RULE,
    FILE_COVERAGE_RULE,
    INLINE_DISABLED,
    INLINE_ENABLED,
    STANDARD_REVIEW_PROMPT,
} from "../prompt";
import {
    createMultiLineCommentTool,
    createSingleLineCommentTool,
    getDirectoryTreeTool,
    getFileContentTool,
    getFileDiffTool,
    postPullRequestCommentTool,
    searchCodeListTool,
    searchLineByKeywordTool,
} from "../tool";
import { generatePullRequestPrompt } from "./prompt";

export async function runStandardReview(
    provider: GitProvider,
    llmSender: LlmSender,
    prIid: number,
    isInlineReview: boolean,
    language: string,
): Promise<ActivityTokenUsage> {
    const { sourceBranch } = await provider.fetchPullRequestDetail(prIid);

    const system = [
        STANDARD_REVIEW_PROMPT,
        FILE_COVERAGE_RULE,
        isInlineReview ? INLINE_ENABLED : INLINE_DISABLED,
        COMMENT_LANGUAGE_RULE,
    ].join("\n\n");

    const prompt = await generatePullRequestPrompt(provider, prIid);

    const result = await runAgentLoop(llmSender, system, prompt, `[PR #${prIid}] Standard Review`, {
        toolList: [
            getFileDiffTool(provider, prIid),
            searchCodeListTool(provider, sourceBranch),
            searchLineByKeywordTool(provider, sourceBranch),
            getDirectoryTreeTool(provider, sourceBranch),
            getFileContentTool(provider, sourceBranch),
            postPullRequestCommentTool(provider, prIid, language),
            isInlineReview ? createSingleLineCommentTool(provider, prIid, language) : null,
            isInlineReview ? createMultiLineCommentTool(provider, prIid, language) : null,
        ],
        maxSteps: 200,
    });

    return result.usage;
}
