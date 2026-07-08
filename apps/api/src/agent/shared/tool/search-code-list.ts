import type { AgentTool } from "../../llm/loop.js";
import type { GitProvider } from "../../../git-provider/types.js";

export function searchCodeListTool(provider: GitProvider, ref: string): AgentTool | null {
    if (!provider.isCodeSearchSupported()) {
        return null;
    }
    return {
        name: "search_code_list",
        description: [
            "Search repository code at the PR source branch by symbol, phrase, or keyword.",
            "Single term only — one symbol/keyword per call.",
            "No spaces, no multiple words, no auto split. If you need several terms, call search_code_list multiple times with one term each. Returns matching file paths with code snippets. Use this to: (1) locate function/class definitions referenced in the diff, (2) find API endpoints or route handlers by path pattern, (3) discover usages of a changed interface/export. Does NOT support regex. After locating relevant files, use get_merge_file_content or get_file_content to read their full content.",
        ].join("\n"),
        parameters: {
            type: "object",
            properties: {
                query: {
                    type: "string",
                    description: "A symbol, phrase, error text, or feature keyword to search for. ",
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
