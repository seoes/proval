import { runAgentLoop } from "../llm/loop";
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
    getFileDiffTool,
    getMergeFileContentTool,
    postPullRequestCommentTool,
    searchCodeListTool,
    searchLineByKeywordTool,
} from "../tool";
import { generatePullRequestPrompt } from "./prompt";
import type { PullRequestReview } from ".";

export const runStandardReview: PullRequestReview = async ({
    provider,
    llmSender,
    prIid,
    isInlineReview,
    language,
}) => {
    const { baseSha, headSha, startSha } = await provider.fetchPullRequestVersion(prIid);
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
            searchCodeListTool(provider, headSha),
            searchLineByKeywordTool(provider, headSha),
            getDirectoryTreeTool(provider, headSha),
            getMergeFileContentTool(provider, { baseSha, headSha }),
            postPullRequestCommentTool(provider, prIid, language),
            isInlineReview ? createSingleLineCommentTool(provider, prIid, language, baseSha, headSha, startSha) : null,
            isInlineReview ? createMultiLineCommentTool(provider, prIid, language, baseSha, headSha, startSha) : null,
        ],
        maxSteps: 200,
    });

    return result.usage;
};
