import type { AgentTool } from "../loop.js";
import type { GitProvider } from "../../provider/types.js";

export function getFileDiffTool(provider: GitProvider, mrIid: number): AgentTool {
    return {
        name: "get_file_diff",
        description:
            "Get the full unified diff for one changed file in the current pull/merge request. Returns patch text with line numbers, context lines, and +/- markers. Use after get_changed_file_list to inspect only relevant patches. The diff shows old_path/new_path — use these paths in inline comment tools.",
        parameters: {
            type: "object",
            properties: {
                filePath: {
                    type: "string",
                    description:
                        "Repository-relative path of the changed file. You may pass either the old path or the current path.",
                },
            },
            required: ["filePath"],
        },
        execute: async (args) => {
            const filePath = String(args.filePath);
            const diff = await provider.fetchFileDiff(mrIid, filePath);
            return diff;
        },
    };
}
