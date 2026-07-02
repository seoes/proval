import type { AgentTool } from "../llm/loop.js";
import type { GitProvider } from "../../git-provider/types.js";
import { UNTRUSTED_WARNING_TOOL_PROMPT } from "../prompt/untrusted-warning.prompt.js";
import { parseListToolPagination, slicePage, toAgentPaginatedInlineReviewList } from "../util.js";

export function getPullRequestInlineReviewListTool(provider: GitProvider, prIid: number): AgentTool {
    return {
        name: "get_pull_request_inline_review_list",
        description: [
            "Get inline review threads on this pull request. Each thread includes path, resolved state, and comment summaries (bodyPreview truncated to 100 chars). Use get_pull_request_inline_review_comment for full text. Recommended limit: 20.",
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
                    description: "Number of threads per page. Recommended: 20.",
                },
            },
            required: ["page", "limit"],
        },
        execute: async (args) => {
            const { page, limit } = parseListToolPagination(args);
            const inlineReviewList = await provider.fetchPullRequestInlineReviewList(prIid);
            return toAgentPaginatedInlineReviewList(slicePage(inlineReviewList, page, limit));
        },
    };
}
