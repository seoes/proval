import type { AgentTool } from "../loop.js";
import type { GitProvider } from "../../provider/types.js";

export function getFileContentTool(provider: GitProvider, ref: string): AgentTool {
    return {
        name: "get_file_content",
        description: `Read the full content of a file at repository ref ${ref}. Use for imports, callers, types, and surrounding logic before making claims about the codebase.`,
        parameters: {
            type: "object",
            properties: {
                filePath: {
                    type: "string",
                    description: "Repository-relative path to the file.",
                },
            },
            required: ["filePath"],
        },
        execute: async (args) => {
            const filePath = String(args.filePath);
            const content = await provider.fetchFileContent(filePath, ref);

            const lines = content.split("\n");
            if (lines.length > 1000) {
                return {
                    warning: `File is too large to read. (${lines.length} lines) Showing first 1000 lines.`,
                    content: lines.slice(0, 1000).join("\n"),
                    totalLines: lines.length,
                };
            }
            return content;
        },
    };
}
