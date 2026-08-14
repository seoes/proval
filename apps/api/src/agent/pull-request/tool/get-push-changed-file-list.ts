import type { AgentTool } from "../../llm/loop.js";
import type { Workspace } from "../../../git-provider/workspace.js";
import { UNTRUSTED_WARNING_TOOL_PROMPT } from "../../shared/prompt/untrusted-warning.prompt.js";

export function getPushChangedFileListTool(workspace: Workspace): AgentTool {
    return {
        name: "get_push_changed_file_list",
        description: [
            "List files changed in THIS follow-up push only (previous reviewed head → current head), without full patches.",
            "Unlike get_changed_file_list (entire PR base→head), this returns only the delta since the last Proval review.",
            "On follow-up reviews, prefer this FIRST for planning coverage and unit files[].",
            "Use get_changed_file_list only when you need the full PR file map for regression or boundary context.",
            UNTRUSTED_WARNING_TOOL_PROMPT,
        ].join(" "),
        untrustedResult: true,
        parameters: {
            type: "object",
            properties: {},
            required: [],
        },
        execute: async () => {
            return workspace.pushChangedFileList();
        },
    };
}
