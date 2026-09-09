import type { ActivityTokenUsage } from "@proval/types";
import type { GitProvider } from "../../../git-provider/types.js";
import { logError } from "../../../util/log.js";
import type { LlmSender } from "../../llm/loop.js";
import { CommentService } from "../../../api/comment/comment.service.js";

type DebugCommentInput = {
    sender: LlmSender;
    workflow: string;
    usage: ActivityTokenUsage;
    fields?: Record<string, string | number | boolean>;
};

function isDevEnvironment(): boolean {
    return process.env.NODE_ENV !== "production";
}

function buildDebugCommentBody({ sender, workflow, usage, fields }: DebugCommentInput): string {
    const model = sender.getModel();
    const lines = ["## Debug Comment", "", `Workflow: ${workflow}`];

    if (fields) {
        for (const [label, value] of Object.entries(fields)) {
            lines.push(`${label}: ${value}`);
        }
    }

    lines.push(
        "",
        `Model: ${model.model} (${model.provider}) @ ${model.baseUrl}`,
        "",
        `Input Token: ${usage.inputToken}`,
        `Cached Input Token: ${usage.cachedInputToken}`,
        `Output Token: ${usage.outputToken}`,
    );

    return lines.join("\n");
}

export async function postDevDebugPullRequestComment(
    provider: GitProvider,
    prIid: number,
    activityId: number,
    input: DebugCommentInput,
    inlineReviewId?: string,
): Promise<void> {
    if (!isDevEnvironment()) return;

    try {
        const body = buildDebugCommentBody(input);
        const commentService = new CommentService();
        const comment = inlineReviewId
            ? await provider.replyToPullRequestInlineReview(prIid, inlineReviewId, body)
            : await provider.createPullRequestComment(prIid, body);
        await commentService.create(
            activityId,
            inlineReviewId ? "inline_review" : "comment",
            comment.id,
            comment.body,
        );
        for (const flushed of provider.takeFlushedInlineCommentList()) {
            await commentService.create(activityId, "inline_review", flushed.id, flushed.body);
        }
    } catch (error) {
        logError("Failed to post dev debug pull request comment", error);
    }
}

export async function postDevDebugIssueComment(
    provider: GitProvider,
    issueIid: number,
    activityId: number,
    input: DebugCommentInput,
): Promise<void> {
    if (!isDevEnvironment()) return;

    try {
        const comment = await provider.createIssueComment(issueIid, buildDebugCommentBody(input));
        await new CommentService().create(activityId, "comment", comment.id, comment.body);
    } catch (error) {
        logError("Failed to post dev debug issue comment", error);
    }
}
