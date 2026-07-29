import type { PullRequestReview } from "../index.js";
import { postDevDebugPullRequestComment } from "../../shared/util/debug.js";
import { generatePullRequestPrompt } from "../prompt/context.js";
import { runReviewPlanAgent } from "./plan.service.js";
import { runReviewSubAgent } from "./sub.service.js";
import { runReviewWritingAgent } from "./writing.service.js";
import { logAgent } from "../../../util/log.js";

export const runPullRequestReview: PullRequestReview = async (params) => {
    const { provider, workspace, llmSender, prIid, isInlineReview, language, activityId } = params;
    const label = `[PR #${prIid}] Review`;
    try {
        logAgent(activityId, "fetching pull request version", label);
        const { baseSha, headSha, startSha } = await provider.fetchPullRequestVersion(prIid);
        logAgent(activityId, `version ready head=${headSha.slice(0, 12)}…`, label);

        await workspace.load({ headRef: headSha, prIid, activityId, label });

        logAgent(activityId, "building pull request prompt", label);
        const prompt = await generatePullRequestPrompt(workspace, prIid, headSha);

        const planResult = await runReviewPlanAgent(provider, workspace, llmSender, prompt, prIid, activityId);
        const total = planResult.reviewUnitList.length;

        const subAgentResultList = await Promise.all(
            planResult.reviewUnitList.map((reviewUnit, index) =>
                runReviewSubAgent(
                    provider,
                    workspace,
                    llmSender,
                    prompt,
                    prIid,
                    reviewUnit,
                    index + 1,
                    total,
                    activityId,
                ),
            ),
        );

        const writingResult = await runReviewWritingAgent(
            provider,
            workspace,
            llmSender,
            prompt,
            prIid,
            baseSha,
            headSha,
            startSha,
            subAgentResultList.map((result) => result.finalMessage),
            isInlineReview,
            language,
            activityId,
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

        return {
            ...usage,
            reviewUnitList: planResult.reviewUnitList,
            subAgentList: subAgentResultList.map((result, index) => ({
                index: index + 1,
                total,
                reviewUnit: planResult.reviewUnitList[index]!,
                finalMessage: result.finalMessage,
                inputToken: result.inputToken,
                outputToken: result.outputToken,
                cachedInputToken: result.cachedInputToken,
            })),
        };
    } finally {
        await workspace.clean();
    }
};
