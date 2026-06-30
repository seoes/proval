import type { AgentTool } from "../llm/loop.js";
import type { GitProvider } from "../../git-provider/types.js";

export function getPullRequestCommentListTool(provider: GitProvider, prIid: number): AgentTool {
    return {
        name: "get_pull_request_comment_list",
        description:
            "Get all conversation comments on this pull request (issue-level comments only, not inline review threads). Returns structured data: author, timestamp, body. Use this to understand prior PR discussion before replying.",
        parameters: {
            type: "object",
            properties: {},
            required: [],
        },
        execute: async () => {
            const comments = await provider.fetchPullRequestCommentList(prIid);
            return comments;
        },
    };
}
