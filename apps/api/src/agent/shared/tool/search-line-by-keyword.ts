import type { AgentTool } from "../../llm/loop.js";
import type { GitProvider } from "../../../git-provider/types.js";
import { UNTRUSTED_WARNING_TOOL_PROMPT } from "../prompt/untrusted-warning.prompt.js";

export function searchLineByKeywordTool(provider: GitProvider, ref: string): AgentTool {
    return {
        name: "search_line_by_keyword",
        description: [
            `Search for a keyword in a specific file at the PR source branch (ref: ${ref}).`,
            "Returns matching lines with line numbers.",
            "Use this to (1) check if a specific function/symbol/pattern exists without reading the whole file, (2) find all occurrences of an identifier, (3) validate assumptions before investing tool steps.",
            "If you need surrounding context after checking, use get_merge_file_content or get_file_content.",
            "filePath must be a file path only — not a directory.",
            "Note: keyword search is case-sensitive.",
            UNTRUSTED_WARNING_TOOL_PROMPT,
        ].join(" "),
        untrustedResult: true,
        parameters: {
            type: "object",
            properties: {
                filePath: { type: "string", description: "Repository-relative path to the file." },
                keyword: {
                    type: "string",
                    description: "Text to search for within the file (case-sensitive).",
                },
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
