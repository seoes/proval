import type { AgentTool } from "../../llm/loop.js";
import type { GitProvider } from "../../../git-provider/types.js";
import { buildCommentToolLanguageNote, buildCommentBodyDescription } from "../../shared/prompt/index.js";
import { CommentService } from "../../../api/comment/comment.service.js";

export function postPullRequestInlineReviewReplyTool(
    provider: GitProvider,
    prIid: number,
    inlineReviewId: string,
    commenterUsername: string,
    language: string,
    activityId: number,
): AgentTool {
    const commentService = new CommentService();
    return {
        name: "post_pull_request_inline_review_reply",
        description: [
            "Post your reply to the user's inline review comment. The @mention is added automatically — do NOT include it. Call ONCE when done.",
            buildCommentToolLanguageNote(language),
        ].join(" "),
        parameters: {
            type: "object",
            properties: {
                body: {
                    type: "string",
                    description: buildCommentBodyDescription(language),
                },
            },
            required: ["body"],
        },
        execute: async (args) => {
            const body = String(args.body);
            const fullBody = `@${commenterUsername}\n\n${body}`;
            const comment = await provider.replyToPullRequestInlineReview(prIid, inlineReviewId, fullBody);
            await commentService.create(activityId, "inline_review", comment.id, comment.body);
            for (const flushed of provider.takeFlushedInlineCommentList()) {
                await commentService.create(activityId, "inline_review", flushed.id, flushed.body);
            }
            return comment;
        },
    };
}
