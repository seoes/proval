import type { AgentTool } from "../llm/loop.js";
import type { GitProvider } from "../../git-provider/types.js";

export function getPullRequestCommentTool(provider: GitProvider, prIid: number): AgentTool {
    return {
        name: "get_pull_request_comment",
        description:
            "Get a specific comment on this pull request. Returns structured data: author, timestamp, body. Use this to (1) avoid duplicating existing feedback, (2) understand reviewer/MR author expectations, (3) check if a thread is resolved before re-raising the same concern. Call this early before posting any findings.",
        parameters: {
            type: "object",
            properties: {
                commentId: {
                    type: "number",
                    description: "The ID of the comment to get. Use the id of the comment from the comment list.",
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
