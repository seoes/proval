import type { AgentTool } from "../llm/loop.js";
import type { GitProvider } from "../../git-provider/types.js";
import { buildCommentToolLanguageNote, buildCommentBodyDescription } from "../prompt/index.js";

export function postPullRequestInlineReviewReplyTool(
    provider: GitProvider,
    prIid: number,
    inlineReviewId: string,
    commenterUsername: string,
    language: string,
): AgentTool {
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
            return comment;
        },
    };
}
