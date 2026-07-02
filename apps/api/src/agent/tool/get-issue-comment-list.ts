import type { AgentTool } from "../llm/loop.js";
import type { GitProvider } from "../../git-provider/types.js";
import { parseListToolPagination, slicePage, toAgentPaginatedCommentList } from "../util.js";

export function getIssueCommentListTool(provider: GitProvider, issueIid: number): AgentTool {
    return {
        name: "get_issue_comment_list",
        description:
            "Get existing comments on this issue. Returns paginated summaries with bodyPreview truncated to 100 chars. Use individual comment tools for full text. Recommended limit: 20.",
        parameters: {
            type: "object",
            properties: {
                page: {
                    type: "number",
                    description: "Page number (1-based).",
                },
                limit: {
                    type: "number",
                    description: "Number of comments per page. Recommended: 20.",
                },
            },
            required: ["page", "limit"],
        },
        execute: async (args) => {
            const { page, limit } = parseListToolPagination(args);
            const commentList = await provider.fetchIssueCommentList(issueIid);
            return toAgentPaginatedCommentList(slicePage(commentList, page, limit));
        },
    };
}
