import type { PullRequestReview, ReviewMeasureEvent } from "../index.js";
import type { AgentLoopEvent } from "../../llm/loop.js";
import { postDevDebugPullRequestComment } from "../../shared/util/debug.js";
import { generatePullRequestPrompt } from "../prompt/context.js";
import { buildAgentInstructionPrompt } from "../prompt/agents-md.js";
import { runReviewPlanAgent } from "./plan.service.js";
import { runReviewSubAgent } from "./sub.service.js";
import type { ReviewHandoff } from "./handoff.schema.js";
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
        userPrompt = null,
        activityId,
        isFollowUpReview = false,
        previousHeadSha = null,
        onEvent,
    } = params;
    const emit = (event: ReviewMeasureEvent) => onEvent?.(event);
    const emitLoop = (agent: string) => (event: AgentLoopEvent) => emit({ type: "agent", agent, event });
    const label = `[PR #${prIid}] Setup`;
    const emojiTarget = { type: "pull_request" as const, prIid };
    emit({ type: "phase-start", phase: "setup" });
    try {
        try {
            await provider.addEmoji(emojiTarget, "👀");
        } catch (error) {
            logAgentError(activityId, "add emoji failed", error, label);
        }

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
                logAgentError(activityId, "push scope failed, falling back to full pull request diffs", error, label);
            }
        }

        logAgent(activityId, "building pull request prompt", label);
        let prompt = await generatePullRequestPrompt(workspace, prIid, version, previousShaForPrompt);
        const agentInstructionPrompt = await buildAgentInstructionPrompt(workspace, activityId, label);

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

        emit({ type: "phase-end", phase: "setup" });
        emit({ type: "phase-start", phase: "plan" });
        const planResult = await runReviewPlanAgent(
            provider,
            workspace,
            llmSender,
            prompt,
            prIid,
            activityId,
            isFollowUpReview,
            usePushScope,
            userPrompt,
            agentInstructionPrompt,
            emitLoop("plan"),
        );
        emit({ type: "phase-end", phase: "plan" });
        emit({ type: "phase-start", phase: "sub" });
        const total = planResult.reviewUnitList.length;
        const reviewHandoffList: ReviewHandoff[] = [];

        // Every sub agent shares this workspace and the cleanup in the finally
        // block below destroys it. Waiting for all of them to settle keeps a
        // single failure from leaving the rest running against a workspace that
        // no longer exists, which otherwise burns model token until the step
        // budget runs out.
        const subAgentSettledList = await Promise.allSettled(
            planResult.reviewUnitList.map(async (reviewUnit, index) => {
                emit({ type: "sub-start", index: index + 1, total });
                try {
                    const result = await runReviewSubAgent(
                        provider,
                        workspace,
                        llmSender,
                        prompt,
                        prIid,
                        reviewUnit,
                        reviewHandoffList,
                        index + 1,
                        total,
                        activityId,
                        usePushScope,
                        userPrompt,
                        agentInstructionPrompt,
                        emitLoop(`sub-${index + 1}`),
                    );
                    emit({ type: "sub-end", index: index + 1, ok: true });
                    return result;
                } catch (error) {
                    emit({ type: "sub-end", index: index + 1, ok: false });
                    throw error;
                }
            }),
        );
        emit({ type: "phase-end", phase: "sub" });
        emit({ type: "phase-start", phase: "writing" });

        const subAgentResultList: Awaited<ReturnType<typeof runReviewSubAgent>>[] = [];
        for (const settled of subAgentSettledList) {
            if (settled.status === "rejected") {
                throw settled.reason;
            }
            subAgentResultList.push(settled.value);
        }

        const sortedHandoffList = [...reviewHandoffList].sort((a, b) => a.unitId - b.unitId);

        const writingResult = await runReviewWritingAgent(
            provider,
            workspace,
            llmSender,
            prompt,
            prIid,
            baseSha,
            headSha,
            startSha,
            sortedHandoffList,
            isInlineReview,
            language,
            activityId,
            isFollowUpReview,
            priorBotSummary,
            usePushScope,
            userPrompt,
            agentInstructionPrompt,
            emitLoop("writing"),
        );
        emit({ type: "phase-end", phase: "writing" });
        emit({ type: "phase-start", phase: "finalize" });

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

        emit({ type: "phase-end", phase: "finalize" });
        return {
            ...usage,
            reviewUnitList: planResult.reviewUnitList,
            skippedFileList: planResult.skippedFileList,
            subAgentList: subAgentResultList.map((result, index) => ({
                index: index + 1,
                total,
                reviewUnit: planResult.reviewUnitList[index]!,
                handoff: result.handoff,
                inputToken: result.inputToken,
                outputToken: result.outputToken,
                cachedInputToken: result.cachedInputToken,
            })),
        };
    } finally {
        try {
            await provider.removeEmoji(emojiTarget, "👀");
        } catch (error) {
            logAgentError(activityId, "remove emoji failed", error, label);
        }
        await workspace.clean();
    }
};
