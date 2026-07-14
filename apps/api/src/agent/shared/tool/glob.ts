import type { AgentTool } from "../../llm/loop.js";
import type { Workspace } from "../../../git-provider/workspace.js";
import { UNTRUSTED_WARNING_TOOL_PROMPT } from "../prompt/untrusted-warning.prompt.js";

export function globTool(workspace: Workspace): AgentTool {
    return {
        name: "glob",
        description: [
            "Find files by glob pattern in the checked-out workspace.",
            "Example: **/tailwind.config.*, **/*Button*.tsx",
            "Returns at most 100 paths.",
            UNTRUSTED_WARNING_TOOL_PROMPT,
        ].join(" "),
        untrustedResult: true,
        parameters: {
            type: "object",
            properties: {
                pattern: {
                    type: "string",
                    description: "Glob pattern relative to repository root.",
                },
            },
            required: ["pattern"],
        },
        execute: async (args) => {
            const pattern = String(args.pattern);
            const paths = await workspace.glob(pattern);
            return {
                paths,
                message:
                    paths.length >= 100
                        ? "Found many files. Returned the first 100 paths."
                        : `Found ${paths.length} files.`,
            };
        },
    };
}
