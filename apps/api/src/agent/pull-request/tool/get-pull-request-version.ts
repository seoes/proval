import type { AgentTool } from "../../llm/loop.js";
import type { GitProvider } from "../../../git-provider/types.js";

export function getPullRequestVersionTool(provider: GitProvider, prIid: number): AgentTool {
    return {
        name: "get_pull_request_version",
        description:
            "Get commit SHAs (baseSha, startSha, headSha) for the current pull request. These SHAs are REQUIRED by create_single_line_comment and create_multi_line_comment for inline comment positioning. Call this ONCE at the start of your review and reuse the values for all inline comments. Do NOT call this multiple times.",
        parameters: {
            type: "object",
            properties: {},
            required: [],
        },
        execute: async () => {
            const version = await provider.fetchPullRequestVersion(prIid);
            return version;
        },
    };
}
