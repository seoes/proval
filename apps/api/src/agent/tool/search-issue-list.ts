import type { AgentTool } from "../loop.js";
import type { GitProvider } from "../../provider/types.js";

export function searchIssueListTool(provider: GitProvider): AgentTool {
    return {
        name: "search_issue_list",
        description:
            "Search other issues in the same repository. Use this before claiming something is a duplicate or related.",
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
            return provider.searchIssueList(query);
        },
    };
}
