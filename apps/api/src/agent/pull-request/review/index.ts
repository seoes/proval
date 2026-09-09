import type { PullRequestReview } from "../index.js";
import { postDevDebugPullRequestComment } from "../../shared/util/debug.js";
import { generatePullRequestPrompt } from "../prompt/context.js";
import { runReviewPlanAgent } from "./plan.service.js";
import { runReviewSubAgent } from "./sub.service.js";
import { runReviewWritingAgent, truncatePriorSummary } from "./writing.service.js";
import { buildFollowUpThreadContext, buildPushScopeContext } from "./follow-up.context.js";
import { logAgent, logAgentError } from "../../../util/log.js";

async function loadPriorBotSummary(
    provider: Parameters<PullRequestReview>[0]["provider"],
    prIid: number,
    activityId: number,
    label: string,
): Promise<string | null> {
    try {
        const bot = await provider.fetchCurrentUser();
        const commentList = await provider.fetchPullRequestCommentList(prIid);
        const botCommentList = [...commentList]
            .filter((comment) => comment.author === bot.username && comment.body.trim())
            .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        const prior = botCommentList[botCommentList.length - 1];
        if (!prior) return null;
        return truncatePriorSummary(prior.body);
    } catch (error) {
        logAgentError(activityId, "prior bot summary load failed", error, label);
        return null;
    }
}

export const runPullRequestReview: PullRequestReview = async (params) => {
    const {
        provider,
        workspace,
        llmSender,
        prIid,
        isInlineReview,
        language,
        activityId,
        isFollowUpReview = false,
        previousHeadSha = null,
    } = params;
    const label = `[PR #${prIid}] Review`;
    try {
        logAgent(activityId, "fetching pull request version", label);
        const detail = await provider.fetchPullRequestDetail(prIid);
        const version = await provider.fetchPullRequestVersion(prIid);
        const { baseSha, headSha, startSha } = version;
        logAgent(activityId, `version ready head=${headSha.slice(0, 12)}…`, label);

        await workspace.loadFromPullRequest({
            prIid,
            targetBranch: detail.targetBranch,
            headSha,
            startSha,
            baseSha,
            previousSha: previousHeadSha,
        });

        let usePushScope = false;
        let pushScopePrompt: string | null = null;
        let previousShaForPrompt = previousHeadSha;

        if (previousHeadSha) {
            logAgent(
                activityId,
                `comparing push scope ${previousHeadSha.slice(0, 12)}… → ${headSha.slice(0, 12)}…`,
                label,
            );
            try {
                const pushFileList = await workspace.pushChangedFileList();
                const pushPathList = pushFileList
                    .map((file) => file.newPath || file.oldPath)
                    .filter((path) => path !== "");
                pushScopePrompt = buildPushScopeContext({
                    previousHeadSha,
                    headSha,
                    pushPathList,
                });
                usePushScope = true;
                logAgent(activityId, `push scope ready (${pushFileList.length} files)`, label);
            } catch (error) {
                previousShaForPrompt = null;
                logAgentError(
                    activityId,
                    "push scope failed, falling back to full pull request diffs",
                    error,
                    label,
                );
            }
        }

        logAgent(activityId, "building pull request prompt", label);
        let prompt = await generatePullRequestPrompt(workspace, prIid, version, previousShaForPrompt);

        let priorBotSummary: string | null = null;
        let threadContext: string | null = null;
        if (isFollowUpReview) {
            logAgent(activityId, "loading prior bot review summary", label);
            priorBotSummary = await loadPriorBotSummary(provider, prIid, activityId, label);
            logAgent(activityId, "loading follow-up thread context", label);
            try {
                threadContext = await buildFollowUpThreadContext(provider, prIid);
            } catch (error) {
                logAgentError(activityId, "failed to load thread context", error, label);
            }
        }

        const promptPartList = [prompt, pushScopePrompt, threadContext].filter(Boolean);
        prompt = promptPartList.join("\n\n");

        const planResult = await runReviewPlanAgent(
            provider,
            workspace,
            llmSender,
            prompt,
            prIid,
            activityId,
            isFollowUpReview,
            usePushScope,
        );
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
                    usePushScope,
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
            isFollowUpReview,
            priorBotSummary,
            usePushScope,
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

        await postDevDebugPullRequestComment(provider, prIid, activityId, {
            sender: llmSender,
            workflow: "PR Review",
            usage,
            fields: {
                "Pull Request IID": prIid,
                "Inline Review": isInlineReview,
                "Follow Up Review": isFollowUpReview,
                "Push Scope": usePushScope,
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
