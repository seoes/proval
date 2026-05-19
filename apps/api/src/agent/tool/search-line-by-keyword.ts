import type { AgentTool } from "../loop.js";
import type { GitProvider } from "../../provider/types.js";

export function searchLineByKeywordTool(provider: GitProvider, ref: string): AgentTool {
    return {
        name: "search_line_by_keyword",
        description: `Search for a keyword in a specific file at repository ref ${ref}. Returns matching lines with line numbers. Use it only to check if the keyword is present in the file. If you need context after checking, you must use get_file_content tool.`,
        parameters: {
            type: "object",
            properties: {
                filePath: { type: "string", description: "Repository-relative path to the file." },
                keyword: { type: "string", description: "Text to search for within the file (case-sensitive)." },
            },
            required: ["filePath", "keyword"],
        },
        execute: async (args) => {
            const filePath = String(args.filePath);
            const keyword = String(args.keyword);
            return provider.searchLineByKeyword(keyword, filePath, ref);
        },
    };
}
