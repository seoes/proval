import type { AgentTool } from "../loop.js";
import type { GitProvider } from "../../provider/types.js";

export function getMergeRequestCommentListTool(provider: GitProvider, mrIid: number): AgentTool {
    return {
        name: "get_merge_request_comment_list",
        description:
            "Get ALL existing comments, review threads, and discussions on this pull/merge request. Returns structured data: author, timestamp, body, resolved status, and thread replies. Use this to (1) avoid duplicating existing feedback, (2) understand reviewer/MR author expectations, (3) check if a thread is resolved before re-raising the same concern. Call this early before posting any findings.",
        parameters: {
            type: "object",
            properties: {},
            required: [],
        },
        execute: async () => {
            const comments = await provider.fetchMergeRequestCommentList(mrIid);
            return comments;
        },
    };
}
