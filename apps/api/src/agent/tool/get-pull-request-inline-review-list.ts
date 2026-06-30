import type { AgentTool } from "../llm/loop.js";
import type { GitProvider } from "../../git-provider/types.js";

export function getPullRequestInlineReviewListTool(provider: GitProvider, prIid: number): AgentTool {
    return {
        name: "get_pull_request_inline_review_list",
        description:
            "Get all inline review threads on this pull request. Each thread includes path, line range, resolved state, and commentList. Use this to see inline feedback elsewhere on the PR before replying in the current thread.",
        parameters: {
            type: "object",
            properties: {},
            required: [],
        },
        execute: async () => {
            const reviews = await provider.fetchPullRequestInlineReviewList(prIid);
            return reviews;
        },
    };
}
