import type { AgentTool } from "../loop.js";
import type { GitProvider } from "../../provider/types.js";

export function getDirectoryTreeTool(provider: GitProvider, ref: string): AgentTool {
    return {
        name: "get_directory_tree",
        description: [
            "Get the directory tree of a repository at a given path.",
            "Use this when exploring folder structure or finding sibling/related files.",
            "Do NOT use this to read file contents — use get_file_content for that.",
            "Do NOT use this to search for code patterns — use search_code_list for that.",
        ].join("\n"),
        parameters: {
            type: "object",
            properties: {
                filePath: {
                    type: "string",
                    description: "The path of the directory to get the tree of.",
                },
                recursive: {
                    type: "boolean",
                    description: "Whether to get the tree recursively.",
                },
            },
            required: ["filePath"],
        },
        execute: async (args) => {
            const filePath = String(args.filePath);
            const recursive = Boolean(args.recursive);
            const tree = await provider.fetchDirectoryTree(filePath, ref, recursive);
            return tree;
        },
    };
}
