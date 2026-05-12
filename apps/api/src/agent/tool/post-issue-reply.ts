import type { AgentTool } from "../loop.js";
import type { GitProvider } from "../../provider/types.js";

export function postIssueReplyTool(provider: GitProvider, issueIid: number, mentionTarget: string): AgentTool {
    return {
        name: "post_issue_reply",
        description:
            "Post your reply to the issue commenter. The @mention is added automatically, so do not include it yourself. Call once when done.",
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
            const comment = await provider.createIssueComment(issueIid, fullBody);
            return comment;
        },
    };
}
