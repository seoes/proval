import type { AgentTool } from "../loop.js";
import type { GitProvider } from "../../provider/types.js";

export function getMergeRequestVersionTool(provider: GitProvider, mrIid: number): AgentTool {
    return {
        name: "get_merge_request_version",
        description:
            "Get commit SHAs for the current pull/merge request (base, head, start) for inline comment positioning.",
        parameters: {
            type: "object",
            properties: {},
            required: [],
        },
        execute: async () => {
            const version = await provider.fetchMergeRequestVersion(mrIid);
            return version;
        },
    };
}
