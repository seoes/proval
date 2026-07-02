import type { AgentTool } from "../llm/loop.js";
import type { GitProvider } from "../../git-provider/types.js";
import { UNTRUSTED_WARNING_TOOL_PROMPT } from "../prompt/untrusted-warning.prompt.js";
import { parseListToolPagination, slicePage, toAgentPaginatedCommentList } from "../util.js";

export function getPullRequestCommentListTool(provider: GitProvider, prIid: number): AgentTool {
    return {
        name: "get_pull_request_comment_list",
        description: [
            "Get conversation comments on this pull request (issue-level comments only, not inline review threads). Returns paginated summaries with bodyPreview truncated to 100 chars. Use get_pull_request_comment for full text. Recommended limit: 20.",
            UNTRUSTED_WARNING_TOOL_PROMPT,
        ].join(" "),
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
            const commentList = await provider.fetchPullRequestCommentList(prIid);
            return toAgentPaginatedCommentList(slicePage(commentList, page, limit));
        },
    };
}
