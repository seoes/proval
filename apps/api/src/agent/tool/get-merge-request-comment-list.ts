import type { AgentTool } from "../loop.js";
import type { GitProvider } from "../../provider/types.js";

export function getMergeRequestCommentListTool(provider: GitProvider, mrIid: number): AgentTool {
    return {
        name: "get_merge_request_comment_list",
        description:
            "Get existing issue and review comments on this pull/merge request. Use to avoid duplicating feedback.",
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
