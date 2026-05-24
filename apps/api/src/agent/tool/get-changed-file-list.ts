import type { AgentTool } from "../loop.js";
import type { GitProvider } from "../../provider/types.js";

export function getChangedFileListTool(provider: GitProvider, mrIid: number): AgentTool {
    return {
        name: "get_changed_file_list",
        description:
            "List changed files in the current pull/merge request without loading full patches. Returns each file with new/old path, status (added/modified/deleted/renamed), and change stats (+/- line counts). Use this FIRST to build a complete map of what changed, then prioritize which files need deeper diff inspection via get_file_diff.",
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
