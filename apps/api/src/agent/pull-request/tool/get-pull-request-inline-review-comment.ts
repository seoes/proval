import type { AgentTool } from "../../llm/loop.js";
import type { GitProvider } from "../../../git-provider/types.js";
import { UNTRUSTED_WARNING_TOOL_PROMPT } from "../../shared/prompt/untrusted-warning.prompt.js";

export function getPullRequestInlineReviewCommentTool(provider: GitProvider, prIid: number): AgentTool {
    return {
        name: "get_pull_request_inline_review_comment",
        description: [
            "Get a specific comment inside an inline review thread on this pull request. Returns full body text. Use inline review comment IDs from get_pull_request_inline_review_list.",
            UNTRUSTED_WARNING_TOOL_PROMPT,
        ].join(" "),
        untrustedResult: true,
        parameters: {
            type: "object",
            properties: {
                commentId: {
                    type: "number",
                    description:
                        "The ID of the inline review comment to get. Use ids from get_pull_request_inline_review_list.",
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
