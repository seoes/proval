import type { AgentTool } from "../../llm/loop.js";
import type { GitProvider, GitRepositoryLabel } from "../../../git-provider/types.js";

export function addIssueLabelTool(
    provider: GitProvider,
    issueIid: number,
    labelList: GitRepositoryLabel[],
): AgentTool {
    const nameSet = new Set(labelList.map((item) => item.name));
    return {
        name: "add_issue_label",
        description:
            "Add one existing repository label to this issue. Call once per label. Use only names from the repository label list in the system prompt and follow each label description.",
        parameters: {
            type: "object",
            properties: {
                label: {
                    type: "string",
                    description: "Existing repository label name.",
                },
            },
            required: ["label"],
        },
        execute: async (args) => {
            const label = String(args.label);
            if (!nameSet.has(label)) {
                return {
                    error: "Unknown label. Use a name from the repository label list.",
                    label,
                    labelNameList: labelList.map((item) => item.name),
                };
            }
            await provider.addIssueLabel(issueIid, label);
            return { label };
        },
    };
}
