import type { AgentTool } from "../loop.js";
import type { GitProvider } from "../../provider/types.js";

export function getMergeRequestDetailTool(provider: GitProvider, mrIid: number): AgentTool {
    return {
        name: "get_merge_request_detail",
        description: "Get metadata for the current pull/merge request (title, description, branches, author, state).",
        parameters: {
            type: "object",
            properties: {},
            required: [],
        },
        execute: async () => {
            const detail = await provider.fetchMergeRequestDetail(mrIid);
            return detail;
        },
    };
}
