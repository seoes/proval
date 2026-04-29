import type { AgentTool } from "../loop.js";
import type { GitProvider } from "../../provider/types.js";

export function getDirectoryTreeTool(provider: GitProvider, ref: string): AgentTool {
    return {
        name: "get_directory_tree",
        description: "Get the directory tree of a repository",
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
