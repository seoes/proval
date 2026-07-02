import type { AgentTool } from "../llm/loop.js";
import type { GitProvider } from "../../git-provider/types.js";
import { UNTRUSTED_WARNING_TOOL_PROMPT } from "../prompt/untrusted-warning.prompt.js";

export function getPullRequestCommentTool(provider: GitProvider, prIid: number): AgentTool {
    return {
        name: "get_pull_request_comment",
        description: [
            "Get a specific conversation comment on this pull request (issue-level comment, not inline review). Returns full body text. Use comment IDs from get_pull_request_comment_list.",
            UNTRUSTED_WARNING_TOOL_PROMPT,
        ].join(" "),
        parameters: {
            type: "object",
            properties: {
                commentId: {
                    type: "number",
                    description:
                        "The ID of the conversation comment to get. Use ids from get_pull_request_comment_list.",
                },
            },
            required: ["commentId"],
        },
        execute: async (args) => {
            const commentId = Number(args.commentId);
            const comment = await provider.fetchPullRequestComment(prIid, commentId);
            return comment;
        },
    };
}
