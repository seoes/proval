import type { AgentTool } from "../../llm/loop.js";
import type { GitProvider } from "../../../git-provider/types.js";
import { buildCommentToolLanguageNote, buildCommentBodyDescription } from "../../shared/prompt/index.js";
import { CommentService } from "../../../api/comment/comment.service.js";

export function postIssueReplyTool(
    provider: GitProvider,
    issueIid: number,
    mentionTarget: string,
    language: string,
    activityId: number,
): AgentTool {
    const commentService = new CommentService();
    return {
        name: "post_issue_reply",
        description: [
            "Post your reply to the issue commenter. The @mention is added automatically, so do not include it yourself. Call once when done.",
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
            const comment = await provider.createIssueComment(issueIid, fullBody);
            await commentService.create(activityId, "comment", comment.id, comment.body);
            return comment;
        },
    };
}
