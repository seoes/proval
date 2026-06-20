import type { AgentTool } from "../llm/loop.js";
import type { GitProvider } from "../../git-provider/types.js";

export function getPullRequestCommentListTool(provider: GitProvider, prIid: number): AgentTool {
    return {
        name: "get_pull_request_comment_list",
        description:
            "Get ALL existing comments, review threads, and discussions on this pull request. Returns structured data: author, timestamp, body, resolved status, and thread replies. Use this to (1) avoid duplicating existing feedback, (2) understand reviewer/MR author expectations, (3) check if a thread is resolved before re-raising the same concern. Call this early before posting any findings.",
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
