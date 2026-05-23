import type { AgentTool } from "../loop.js";
import type { GitProvider } from "../../provider/types.js";

export function searchCodeListTool(provider: GitProvider, ref: string): AgentTool {
    return {
        name: "search_code_list",
        description: [
            "Search repository code by symbol, keyword, or pattern at the current ref.",
            "Use this to locate likely files before reading them, or to find usages/references.",
            "Do NOT use this to read file contents — use get_file_content for that.",
            "Do NOT use this to navigate directory structure — use get_directory_tree for that.",
        ].join("\n"),
        parameters: {
            type: "object",
            properties: {
                query: {
                    type: "string",
                    description: "A symbol, phrase, error text, or feature keyword to search for.",
                },
            },
            required: ["query"],
        },
        execute: async (args) => {
            const query = String(args.query);
            return provider.searchCodeList(query, ref);
        },
    };
}
