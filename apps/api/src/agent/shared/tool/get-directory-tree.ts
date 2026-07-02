import type { AgentTool } from "../../llm/loop.js";
import type { GitProvider } from "../../../git-provider/types.js";

export function getDirectoryTreeTool(provider: GitProvider, ref: string): AgentTool {
    return {
        name: "get_directory_tree",
        description:
            "Get the directory tree of a repository at the PR source branch. Use this to understand project structure: locate related modules, config files, test directories, or sibling components. Specify a filePath to scope to a subdirectory; set recursive=true for full depth. Useful for cross-file investigation (same-directory peers, sibling handlers, adjacent tests).",
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
