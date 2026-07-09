import type { GitTree } from "../../../git-provider/types";
import type { AgentTool } from "../../llm/loop";

export function searchFileByNameTool(fileList: GitTree[]): AgentTool {
    return {
        name: "search_file_by_name",
        description: [
            "Search for a file by name in the repository. Use this to find a file by name in the repository. Just the name, not the path.",
        ].join(" "),
        parameters: {
            type: "object",
            properties: {
                name: {
                    type: "string",
                    description:
                        "The name of the file to search for. Must be a same name as the file in the repository. Just the name, not the path.",
                },
            },
            required: ["name"],
        },
        execute: async (args) => {
            const name = String(args.name);
            const matchedFileList = fileList.filter((file) => file.type === "file" && file.name === name);
            if (matchedFileList.length === 0) {
                return {
                    result: [],
                    message: `No file found with the given name.`,
                };
            }
            return {
                result: matchedFileList.slice(0, 50).map((file) => file.path),
                message:
                    matchedFileList.length > 50
                        ? `Found ${matchedFileList.length} files. Returned the first 50 files.`
                        : `Found ${matchedFileList.length} files.`,
            };
        },
    };
}
