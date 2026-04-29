import type { AgentTool } from "../loop.js";
import type { GitProvider } from "../../provider/types.js";

export function getFileContentTool(provider: GitProvider, ref: string): AgentTool {
    return {
        name: "get_file_content",
        description: `Read the full content of a file at the merge request source ref (${ref}). Use for imports, callers, types, and surrounding logic when validating a concern from the diff.`,
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
            return content;
        },
    };
}
