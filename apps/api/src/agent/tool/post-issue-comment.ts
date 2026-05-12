import type { AgentTool } from "../loop.js";
import type { GitProvider } from "../../provider/types.js";

export function postIssueCommentTool(provider: GitProvider, issueIid: number): AgentTool {
    return {
        name: "post_issue_comment",
        description:
            "Post the single top-level issue comment after you have gathered enough context. Call exactly once.",
        parameters: {
            type: "object",
            properties: {
                body: {
                    type: "string",
                    description: "Markdown body for the issue comment.",
                },
            },
            required: ["body"],
        },
        execute: async (args) => {
            const body = String(args.body);
            const comment = await provider.createIssueComment(issueIid, body);
            return comment;
        },
    };
}
