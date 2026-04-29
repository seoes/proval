import type { AgentTool } from "../loop.js";
import type { GitProvider } from "../../provider/types.js";

export function getMergeRequestDiffTool(provider: GitProvider, mrIid: number): AgentTool {
    return {
        name: "get_merge_request_diff",
        description:
            "Get the full diff for the current pull/merge request (per-file patches). Prefer calling get_merge_request_detail first for context; use this for line-by-line changes.",
        parameters: {
            type: "object",
            properties: {},
            required: [],
        },
        execute: async () => {
            const diff = await provider.fetchMergeRequestDiff(mrIid);
            return diff;
        },
    };
}
