import type { AgentTool } from "../../llm/loop.js";
import type { GitProvider } from "../../../git-provider/types.js";
import { UNTRUSTED_WARNING_TOOL_PROMPT } from "../../shared/prompt/untrusted-warning.prompt.js";

export function getFileDiffTool(provider: GitProvider, prIid: number): AgentTool {
    return {
        name: "get_file_diff",
        description: [
            "Get the full unified diff for one changed file in the current pull request. Returns patch text with line numbers, context lines, and +/- markers. Use after get_changed_file_list to inspect only relevant patches. The diff shows old_path/new_path — use these paths in inline comment tools.",
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
            const diff = await provider.fetchFileDiff(prIid, filePath);
            return diff;
        },
    };
}
