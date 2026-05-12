import type { AgentTool } from "../loop.js";
import type { GitProvider } from "../../provider/types.js";

export function getIssueCommentListTool(provider: GitProvider, issueIid: number): AgentTool {
    return {
        name: "get_issue_comment_list",
        description: "Get existing comments on this issue. Use to avoid repeating prior discussion.",
        parameters: {
            type: "object",
            properties: {},
            required: [],
        },
        execute: async () => {
            const comments = await provider.fetchIssueCommentList(issueIid);
            return comments;
        },
    };
}
