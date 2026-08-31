import type { AgentTool } from "../../llm/loop.js";
import type { Workspace } from "../../../git-provider/workspace.js";
import { UNTRUSTED_WARNING_TOOL_PROMPT } from "../../shared/prompt/untrusted-warning.prompt.js";

export function getFileDiffTool(workspace: Workspace): AgentTool {
    return {
        name: "get_file_diff",
        description: [
            "Get the unified diff for one changed file from local git. Default against=start (branch point → head): the PR's own changes. Use against=base (target branch tip → head) to see how the PR differs from the current merge target (staleness / merge drift).",
            "Do NOT use against=base hunks as inline comment anchors. Inline comments must use start→head lines.",
            "Returns patch text with line numbers, context lines, and +/- markers.",
            "The workspace snapshot is head-only. On a follow-up push review, prefer get_push_file_diff first.",
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
                against: {
                    type: "string",
                    enum: ["start", "base"],
                    description:
                        "start (default): merge-base → head, the PR change. base: target branch tip → head, merge-target compare. Inline comments must use start.",
                },
            },
            required: ["filePath"],
        },
        execute: async (args) => {
            const filePath = String(args.filePath);
            const against = args.against === "base" ? "base" : "start";
            return workspace.getFileDiff(filePath, against);
        },
    };
}
