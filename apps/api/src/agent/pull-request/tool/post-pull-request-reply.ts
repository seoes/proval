import type { AgentTool } from "../../llm/loop.js";
import type { GitProvider } from "../../../git-provider/types.js";
import { buildCommentToolLanguageNote, buildCommentBodyDescription } from "../../shared/prompt/index.js";
import { CommentService } from "../../../api/comment/comment.service.js";

export function postPullRequestReplyTool(
    provider: GitProvider,
    prIid: number,
    mentionTarget: string,
    language: string,
    activityId: number,
): AgentTool {
    const commentService = new CommentService();
    return {
        name: "post_reply_comment",
        description: [
            "Post your reply to the user's comment. The @mention is added automatically — do NOT include it. Call ONCE when done.",
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
            const fullBody = `@${mentionTarget}\n\n${body}`;
            const comment = await provider.createPullRequestComment(prIid, fullBody);
            await commentService.create(activityId, "comment", comment.id, comment.body);
            for (const flushed of provider.takeFlushedInlineCommentList()) {
                await commentService.create(activityId, "inline_review", flushed.id, flushed.body);
            }
            return comment;
        },
    };
}
