import type { PullRequestReview } from "../index.js";
import { postDevDebugPullRequestComment } from "../../shared/util/debug.js";
import { generatePullRequestPrompt } from "../prompt/context.js";
import { runReviewPlanAgent } from "./plan.service.js";
import { runReviewSubAgent } from "./sub.service.js";
import { runReviewWritingAgent } from "./writing.service.js";

export const runPullRequestReview: PullRequestReview = async (params) => {
    const { provider, llmSender, prIid, isInlineReview, language } = params;
    const { baseSha, headSha, startSha } = await provider.fetchPullRequestVersion(prIid);
    const fileList = await provider.fetchDirectoryTree("", headSha, true);

    const prompt = await generatePullRequestPrompt(provider, prIid, headSha, fileList);

    const planResult = await runReviewPlanAgent(provider, llmSender, prompt, prIid, baseSha, headSha, fileList);

    const subAgentResultList = await Promise.all(
        planResult.reviewUnitList.map((reviewUnit, index) =>
            runReviewSubAgent(
                provider,
                llmSender,
                prompt,
                prIid,
                baseSha,
                headSha,
                reviewUnit,
                index + 1,
                planResult.reviewUnitList.length,
                fileList,
            ),
        ),
    );

    const writingResult = await runReviewWritingAgent(
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
        fileList,
    );

    const usage = {
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

    await postDevDebugPullRequestComment(provider, prIid, {
        sender: llmSender,
        workflow: "PR Review",
        usage,
        fields: {
            "Pull Request IID": prIid,
            "Inline Review": isInlineReview,
        },
    });

    return usage;
};
