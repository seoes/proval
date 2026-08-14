import type { AgentTool } from "../../llm/loop.js";
import type { Workspace } from "../../../git-provider/workspace.js";
import { UNTRUSTED_WARNING_TOOL_PROMPT } from "../../shared/prompt/untrusted-warning.prompt.js";

export function getPushFileDiffTool(workspace: Workspace): AgentTool {
    return {
        name: "get_push_file_diff",
        description: [
            "Get the unified diff for one file in THIS follow-up push only (previous reviewed head → current head).",
            "Unlike get_file_diff (entire PR base→head patch for that file), this shows only what changed since the last Proval review.",
            "On follow-up reviews, call this FIRST for assigned paths. Use get_file_diff only when you need older PR hunks for regression or consistency.",
            "The workspace snapshot is still head-only for get_file_content / grep.",
            UNTRUSTED_WARNING_TOOL_PROMPT,
        ].join(" "),
        untrustedResult: true,
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
            return workspace.getPushFileDiff(filePath);
        },
    };
}
