import type { AgentTool } from "../loop.js";
import type { GitProvider } from "../../provider/types.js";

export function getMergeRequestVersionTool(provider: GitProvider, mrIid: number): AgentTool {
    return {
        name: "get_merge_request_version",
        description:
            "Get commit SHAs (baseSha, startSha, headSha) for the current pull/merge request. These SHAs are REQUIRED by create_single_line_comment and create_multi_line_comment for inline comment positioning. Call this ONCE at the start of your review and reuse the values for all inline comments. Do NOT call this multiple times.",
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
