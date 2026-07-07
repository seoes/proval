import type { PullRequestReview } from "../index.js";
import { postDevDebugPullRequestComment } from "../../dev-debug-comment.js";
import { generatePullRequestPrompt } from "../prompt/context.js";
import { runReviewPlanAgent } from "./plan.js";
import { runReviewSubAgent } from "./sub.js";
import { runReviewWritingAgent } from "./writing.js";
// import { z } from "zod";

// const reviewFindingSchema = z.object({
//     path: z.string().describe("The path of the file that contains the finding."),
//     line: z.number().describe("The line number of the finding."),

//     problem: z.string().describe("Main description of the problem of the finding."),
//     impact: z.string().describe("The impact of the finding."),
//     suggestion: z
//         .object({
//             language: z.string().describe("The language of the code suggestion."),
//             code: z.string().describe("The code suggestion."),
//             description: z.string().describe("The description of the code suggestion."),
//         })
//         .describe("The code suggestion to fix the finding."),
//     references: z.array(z.string()).describe("Any additional reference file paths to the finding."),
// });

export const runPullRequestReview: PullRequestReview = async (params) => {
    const { provider, llmSender, prIid, isInlineReview, isDeepResearch, language } = params;
    const { baseSha, headSha, startSha } = await provider.fetchPullRequestVersion(prIid);

    const prompt = await generatePullRequestPrompt(provider, prIid);

    // Step 1: Plan
    const planResult = await runReviewPlanAgent(provider, llmSender, prompt, prIid, baseSha, headSha);

    // Step 2: Review
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
            ),
        ),
    );

    // Step 3: Writing
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
            "Deep Research": isDeepResearch,
            "Inline Review": isInlineReview,
        },
    });

    return usage;
};
