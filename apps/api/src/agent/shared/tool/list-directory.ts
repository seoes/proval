import type { AgentTool } from "../../llm/loop.js";
import type { Workspace } from "../../../git-provider/workspace.js";
import { UNTRUSTED_WARNING_TOOL_PROMPT } from "../prompt/untrusted-warning.prompt.js";

export function listDirectoryTool(workspace: Workspace): AgentTool {
    return {
        name: "list_directory",
        description: [
            "List one directory in the checked-out PR/issue workspace (non-recursive).",
            "Use an empty string for the repository root.",
            "Do not end path with '/'. Example: apps/web/modules",
            UNTRUSTED_WARNING_TOOL_PROMPT,
        ].join(" "),
        untrustedResult: true,
        parameters: {
            type: "object",
            properties: {
                path: {
                    type: "string",
                    description: "Directory path relative to repo root. Empty string for root.",
                },
            },
            required: ["path"],
        },
        execute: async (args) => {
            const path = String(args.path ?? "");
            return workspace.list(path);
        },
    };
}
