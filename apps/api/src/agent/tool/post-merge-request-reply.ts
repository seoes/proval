import type { AgentTool } from "../loop.js";
import type { GitProvider } from "../../provider/types.js";

export function postMergeRequestReplyTool(provider: GitProvider, mrIid: number, mentionTarget: string): AgentTool {
    return {
        name: "post_reply_comment",
        description:
            "Post your reply to the user's comment. The @mention is added automatically — do NOT include it. Call ONCE when done.",
        parameters: {
            type: "object",
            properties: {
                body: {
                    type: "string",
                    description: "The reply content in markdown format, without the @mention prefix.",
                },
            },
            required: ["body"],
        },
        execute: async (args) => {
            const body = String(args.body);
            const fullBody = `@${mentionTarget}\n\n${body}`;
            const comment = await provider.createMergeRequestComment(mrIid, fullBody);
            return comment;
        },
    };
}
