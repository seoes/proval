import type { AgentTool } from "../../llm/loop.js";
import type { GitProvider } from "../../../git-provider/types.js";
import { UNTRUSTED_WARNING_TOOL_PROMPT } from "../../shared/prompt/untrusted-warning.prompt.js";

export function searchIssueListTool(provider: GitProvider): AgentTool {
    return {
        name: "search_issue_list",
        description: [
            "Search other issues in the same repository. Use this before claiming something is a duplicate or related.",
            UNTRUSTED_WARNING_TOOL_PROMPT,
        ].join(" "),
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
