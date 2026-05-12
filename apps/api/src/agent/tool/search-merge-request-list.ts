import type { AgentTool } from "../loop.js";
import type { GitProvider } from "../../provider/types.js";

export function searchMergeRequestListTool(provider: GitProvider): AgentTool {
    return {
        name: "search_merge_request_list",
        description:
            "Search merge requests or pull requests in the same repository. Use this for duplicate checks and prior implementation context.",
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
            return provider.searchMergeRequestList(query);
        },
    };
}
