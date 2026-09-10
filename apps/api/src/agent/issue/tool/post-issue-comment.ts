import type { AgentTool } from "../../llm/loop.js";
import type { GitProvider } from "../../../git-provider/types.js";
import { buildCommentToolLanguageNote, buildCommentBodyDescription } from "../../shared/prompt/index.js";
import { CommentService } from "../../../api/comment/comment.service.js";

export function postIssueCommentTool(
    provider: GitProvider,
    issueIid: number,
    language: string,
    activityId: number,
): AgentTool {
    const commentService = new CommentService();
    return {
        name: "post_issue_comment",
        description: [
            "Post the single top-level issue comment after you have gathered enough context. Call exactly once.",
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
            const comment = await provider.createIssueComment(issueIid, body);
            await commentService.create(activityId, "comment", comment.id, comment.body);
            return comment;
        },
    };
}
