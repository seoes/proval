import type { AgentTool } from "../llm/loop.js";
import type { GitProvider } from "../../git-provider/types.js";

export function getIssueDetailTool(provider: GitProvider, issueIid: number): AgentTool {
    return {
        name: "get_issue_detail",
        description: "Get metadata for the current issue (title, description, author, labels, state).",
        parameters: {
            type: "object",
            properties: {},
            required: [],
        },
        execute: async () => {
            const detail = await provider.fetchIssueDetail(issueIid);
            return detail;
        },
    };
}
