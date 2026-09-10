import type { AgentTool } from "../../llm/loop.js";
import type { GitProvider } from "../../../git-provider/types.js";
import { buildCommentToolLanguageNote, buildCommentBodyDescription } from "../../shared/prompt/index.js";
import { CommentService } from "../../../api/comment/comment.service.js";

export function postPullRequestCommentTool(
    provider: GitProvider,
    prIid: number,
    language: string,
    activityId: number,
): AgentTool {
    const commentService = new CommentService();
    return {
        name: "post_pull_request_comment",
        description: [
            "Post the single top-level PR summary note (merge recommendation + short overview). Call exactly ONCE after inline reviews (if any). Do not put full duplicate write-ups of every inline finding here.",
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
            const comment = await provider.createPullRequestComment(prIid, body);
            await commentService.create(activityId, "comment", comment.id, comment.body);
            for (const flushed of provider.takeFlushedInlineCommentList()) {
                await commentService.create(activityId, "inline_review", flushed.id, flushed.body);
            }
            return comment;
        },
    };
}
