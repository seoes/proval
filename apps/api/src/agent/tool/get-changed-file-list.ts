import type { AgentTool } from "../loop.js";
import type { GitProvider } from "../../provider/types.js";

export function getChangedFileListTool(provider: GitProvider, mrIid: number): AgentTool {
    return {
        name: "get_changed_file_list",
        description:
            "List changed files in the current pull/merge request without loading full patches. Use this first to decide which files need deeper review.",
        parameters: {
            type: "object",
            properties: {},
            required: [],
        },
        execute: async () => {
            const files = await provider.fetchChangedFileList(mrIid);
            return files;
        },
    };
}
