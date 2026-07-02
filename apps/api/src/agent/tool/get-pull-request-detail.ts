import type { AgentTool } from "../llm/loop.js";
import type { GitProvider } from "../../git-provider/types.js";
import { UNTRUSTED_WARNING_TOOL_PROMPT } from "../prompt/untrusted-warning.prompt.js";

export function getPullRequestDetailTool(provider: GitProvider, prIid: number): AgentTool {
    return {
        name: "get_pull_request_detail",
        description: [
            "Get metadata for the current pull request (title, description, branches, author, state).",
            UNTRUSTED_WARNING_TOOL_PROMPT,
        ].join(" "),
        parameters: {
            type: "object",
            properties: {},
            required: [],
        },
        execute: async () => {
            const detail = await provider.fetchPullRequestDetail(prIid);
            return detail;
        },
    };
}
