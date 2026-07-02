import type { AgentTool } from "../../llm/loop.js";
import type { GitProvider } from "../../../git-provider/types.js";
import { buildCommentToolLanguageNote, buildCommentBodyDescription } from "../../shared/prompt/index.js";

export function postPullRequestReplyTool(
    provider: GitProvider,
    prIid: number,
    mentionTarget: string,
    language: string,
): AgentTool {
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
            return comment;
        },
    };
}
