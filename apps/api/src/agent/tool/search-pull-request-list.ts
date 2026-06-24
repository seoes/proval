import type { AgentTool } from "../llm/loop.js";
import type { GitProvider } from "../../git-provider/types.js";

export function searchPullRequestListTool(provider: GitProvider): AgentTool {
    return {
        name: "search_pull_request_list",
        description:
            "Search pull requests or pull requests in the same repository. Use this for duplicate checks and prior implementation context.",
        parameters: {
            type: "object",
            properties: {
                query: {
                    type: "string",
                    description: "A short search query built from the issue title, error text, or key concepts.",
                },
            },
            required: ["query"],
        },
        execute: async (args) => {
            const query = String(args.query);
            return provider.searchPullRequestList(query);
        },
    };
}
