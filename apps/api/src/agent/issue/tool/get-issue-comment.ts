import type { AgentTool } from "../../llm/loop.js";
import type { GitProvider } from "../../../git-provider/types.js";
import { UNTRUSTED_WARNING_TOOL_PROMPT } from "../../shared/prompt/untrusted-warning.prompt.js";

export function getIssueCommentTool(provider: GitProvider, issueIid: number): AgentTool {
    return {
        name: "get_issue_comment",
        description: [
            "Get a specific comment on this issue. Returns full body text. Use comment IDs from get_issue_comment_list.",
            UNTRUSTED_WARNING_TOOL_PROMPT,
        ].join(" "),
        parameters: {
            type: "object",
            properties: {
                commentId: {
                    type: "number",
                    description: "The ID of the comment to get. Use ids from get_issue_comment_list.",
                },
            },
            required: ["commentId"],
        },
        execute: async (args) => {
            const commentId = Number(args.commentId);
            const comment = await provider.fetchIssueComment(issueIid, commentId);
            return comment;
        },
    };
}
