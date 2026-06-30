import type { AgentTool } from "../llm/loop.js";
import type { GitProvider } from "../../git-provider/types.js";

export function getPullRequestInlineReviewCommentTool(provider: GitProvider, prIid: number): AgentTool {
    return {
        name: "get_pull_request_inline_review_comment",
        description:
            "Get a specific comment inside an inline review thread on this pull request. Returns structured data: author, timestamp, body. Use inline review comment IDs only — from newComment.id or from inlineReview.commentList entries, not from conversation comments. Call this to read sibling or prior comments in the same inline review thread.",
        parameters: {
            type: "object",
            properties: {
                commentId: {
                    type: "number",
                    description:
                        "The ID of the inline review comment to get. Use ids from newComment or inlineReview.commentList, not conversation comment ids.",
                },
            },
            required: ["commentId"],
        },
        execute: async (args) => {
            const commentId = Number(args.commentId);
            const comment = await provider.fetchPullRequestInlineReviewComment(prIid, commentId);
            return comment;
        },
    };
}
