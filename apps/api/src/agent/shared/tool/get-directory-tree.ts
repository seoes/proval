import type { GitTree } from "../../../git-provider/types";
import type { AgentTool } from "../../llm/loop";

function listDirectory(fileList: GitTree[], filePath: string, recursive: boolean): GitTree[] {
    if (recursive) {
        if (filePath === "") {
            return fileList;
        }

        const prefix = `${filePath}/`;
        return fileList.filter((entry) => entry.path.startsWith(prefix));
    }

    return fileList.filter((entry) => {
        const index = entry.path.lastIndexOf("/");
        const parent = index === -1 ? "" : entry.path.slice(0, index);
        return parent === filePath;
    });
}

export function getDirectoryTreeTool(fileList: GitTree[]): AgentTool {
    return {
        name: "get_directory_tree",
        description: [
            "Get the directory tree of a repository at the PR source branch.",
            "Use this to understand project structure and search for related files: locate related modules, config files, test directories, or sibling components.",
            "filePath must be a directory path only — not a file. Use an empty string for the repository root.",
            "Set recursive=true for full depth under filePath.",
            "Useful for cross-file investigation (same-directory peers, sibling handlers, adjacent tests).",
        ].join(" "),
        parameters: {
            type: "object",
            properties: {
                filePath: {
                    type: "string",
                    description:
                        "Full repo-root-relative directory path. Use an empty string for the repository root. Do not end with '/'. Example: apps/web/modules — not apps/web/modules/.",
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

            const isFile = fileList.some((entry) => entry.path === filePath && entry.type === "file");
            if (isFile) {
                return {
                    error: "Path is a file, not a directory. Use get_merge_file_content or get_file_content.",
                };
            }

            const tree = listDirectory(fileList, filePath, recursive);

            if (filePath !== "" && tree.length === 0) {
                const isDirectory = fileList.some(
                    (entry) => entry.path === filePath && entry.type === "directory",
                );
                if (!isDirectory) {
                    return {
                        error: "Directory not found. Check the repo-root path or list a parent directory with get_directory_tree.",
                    };
                }
            }

            return tree;
        },
    };
}
