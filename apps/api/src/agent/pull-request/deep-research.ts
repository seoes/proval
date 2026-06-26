import type { ActivityTokenUsage } from "@proval/types";
import type { ReviewUnit, SkippedFile } from "../schema/deep-research.schema";
import { runAgentLoop, type LlmSender } from "../llm/loop";
import { DEEP_REVIEW_SUB_AGENT_OUTPUT_FORMAT } from "../prompt/deep-review-sub-agent";
import type { GitProvider } from "../../git-provider/types";
import { generatePullRequestPrompt } from "./prompt";

import {
    COMMENT_LANGUAGE_RULE,
    DEEP_REVIEW_COMMENT_WORKFLOW,
    DEEP_REVIEW_PLAN,
    DEEP_REVIEW_SUB_AGENT_BODY,
    FILE_COVERAGE_RULE,
    INLINE_DISABLED,
    INLINE_ENABLED,
    REVIEW_CHECKLIST,
    SEVERITY,
} from "../prompt";
import {
    appendReviewUnitTool,
    createMultiLineCommentTool,
    createSingleLineCommentTool,
    getDirectoryTreeTool,
    getFileDiffTool,
    postPullRequestCommentTool,
    searchCodeListTool,
    searchLineByKeywordTool,
    skipFileTool,
    getMergeFileContentTool,
} from "../tool";
import type { PullRequestReview } from ".";

export const runDeepResearchReview: PullRequestReview = async ({
    provider,
    llmSender,
    prIid,
    isInlineReview,
    language,
}) => {
    const { baseSha, headSha, startSha } = await provider.fetchPullRequestVersion(prIid);
    const prompt = await generatePullRequestPrompt(provider, prIid);

    // Step 1: Plan
    const planResult = await runDeepResearchPlan(provider, llmSender, prompt, prIid, baseSha, headSha);

    // Step 2: Review
    const subAgentResultList = await Promise.all(
        planResult.reviewUnitList.map((reviewUnit, index) =>
            runDeepResearchSubAgent(
                provider,
                llmSender,
                prompt,
                prIid,
                baseSha,
                headSha,
                reviewUnit,
                index + 1,
                planResult.reviewUnitList.length,
            ),
        ),
    );

    // Step 3: Writing
    const writingResult = await runDeepResearchWriting(
        provider,
        llmSender,
        prompt,
        prIid,
        baseSha,
        headSha,
        startSha,
        subAgentResultList.map((result) => result.finalMessage),
        isInlineReview,
        language,
    );

    return {
        inputToken:
            planResult.inputToken +
            subAgentResultList.reduce((acc, curr) => acc + curr.inputToken, 0) +
            writingResult.inputToken,
        outputToken:
            planResult.outputToken +
            subAgentResultList.reduce((acc, curr) => acc + curr.outputToken, 0) +
            writingResult.outputToken,
        cachedInputToken:
            planResult.cachedInputToken +
            subAgentResultList.reduce((acc, curr) => acc + curr.cachedInputToken, 0) +
            writingResult.cachedInputToken,
    };
};

async function runDeepResearchPlan(
    provider: GitProvider,
    sender: LlmSender,
    pullRequestContextPrompt: string,
    prIid: number,
    baseSha: string,
    headSha: string,
): Promise<ActivityTokenUsage & { reviewUnitList: ReviewUnit[] }> {
    const reviewUnitList: ReviewUnit[] = [];
    const skippedFileList: SkippedFile[] = [];

    const system = [DEEP_REVIEW_PLAN, FILE_COVERAGE_RULE].join("\n\n");
    const toolList = [
        getFileDiffTool(provider, prIid),
        searchCodeListTool(provider, headSha),
        searchLineByKeywordTool(provider, headSha),
        getDirectoryTreeTool(provider, headSha),
        getMergeFileContentTool(provider, { baseSha, headSha }),
        appendReviewUnitTool(reviewUnitList),
        skipFileTool(skippedFileList),
    ];

    const result = await runAgentLoop(sender, system, pullRequestContextPrompt, `[PR #${prIid}] Deep Research Plan`, {
        toolList,
    });

    return {
        reviewUnitList,
        ...result.usage,
    };
}

async function runDeepResearchSubAgent(
    provider: GitProvider,
    sender: LlmSender,
    pullRequestContextPrompt: string,
    prIid: number,
    baseSha: string,
    headSha: string,
    reviewUnit: ReviewUnit,
    index: number,
    totalIndex: number,
): Promise<ActivityTokenUsage & { finalMessage: string }> {
    const system = [DEEP_REVIEW_SUB_AGENT_BODY, REVIEW_CHECKLIST, DEEP_REVIEW_SUB_AGENT_OUTPUT_FORMAT].join("\n\n");
    const prompt = [pullRequestContextPrompt, `review unit: ${JSON.stringify(reviewUnit)}`].join("\n\n");
    const toolList = [
        getFileDiffTool(provider, prIid),
        searchCodeListTool(provider, headSha),
        searchLineByKeywordTool(provider, headSha),
        getDirectoryTreeTool(provider, headSha),
        getMergeFileContentTool(provider, { baseSha, headSha }),
    ];
    const result = await runAgentLoop(
        sender,
        system,
        prompt,
        `[PR #${prIid}] Deep Research Sub ${index}/${totalIndex}`,
        { toolList },
    );

    if (!result.finalMessage) {
        throw new Error("Sub agent failed to return final message");
    }

    return {
        finalMessage: result.finalMessage,
        ...result.usage,
    };
}

async function runDeepResearchWriting(
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
): Promise<ActivityTokenUsage> {
    const system = [
        DEEP_REVIEW_COMMENT_WORKFLOW,
        SEVERITY,
        isInlineReview ? INLINE_ENABLED : INLINE_DISABLED,
        COMMENT_LANGUAGE_RULE,
    ].join("\n\n");
    const prompt = [
        pullRequestContextPrompt,
        `Review unit findings (plain text, one block per sub-agent):\n\n${reviewResultList.join("\n\n")}`,
    ].join("\n\n");

    const result = await runAgentLoop(sender, system, prompt, `[PR #${prIid}] Deep Research Writing`, {
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
    });

    return result.usage;
}
