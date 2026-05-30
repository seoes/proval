import type { AgentTool } from "../loop.js";
import type { GitProvider } from "../../provider/types.js";

export function approvePullRequestTool(provider: GitProvider, prIid: number): AgentTool {
    return {
        name: "approve_pull_request",
        description:
            "Approve this pull request as the bot user (GitLab PR approval). Call only after post_pull_request_comment, when policy allows approval. Call at most once.",
        parameters: {
            type: "object",
            properties: {},
            required: [],
        },
        execute: async () => {
            await provider.approvePullRequest(prIid);
            return { approved: true };
        },
    };
}
