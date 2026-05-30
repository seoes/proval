import type { AgentTool } from "../loop.js";
import type { GitProvider } from "../../provider/types.js";

export function unapprovePullRequestTool(provider: GitProvider, prIid: number): AgentTool {
    return {
        name: "unapprove_pull_request",
        description:
            "Withdraw PR approval (GitLab unapprove). Call only after post_pull_request_comment when the change should not be approved. Call at most once.",
        parameters: {
            type: "object",
            properties: {},
            required: [],
        },
        execute: async () => {
            await provider.unapprovePullRequest(prIid);
            return { unapproved: true };
        },
    };
}
