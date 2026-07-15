import type { AgentTool } from "../../llm/loop.js";
import type { Workspace } from "../../../git-provider/workspace.js";
import { UNTRUSTED_WARNING_TOOL_PROMPT } from "../../shared/prompt/untrusted-warning.prompt.js";

export function getFileDiffTool(workspace: Workspace): AgentTool {
    return {
        name: "get_file_diff",
        description: [
            "Get the full unified diff for one changed file in the current pull request from the workspace cache.",
            "Returns patch text with line numbers, context lines, and +/- markers.",
            "This is the primary way to see before/after for a change — the workspace snapshot is head-only.",
            "Use after the changed-file list to inspect only relevant patches.",
            "The diff shows old_path/new_path — use these paths in inline comment tools.",
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
            return workspace.getFileDiff(filePath);
        },
    };
}
