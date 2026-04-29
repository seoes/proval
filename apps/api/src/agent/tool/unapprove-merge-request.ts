import type { AgentTool } from "../loop.js";
import type { GitProvider } from "../../provider/types.js";

export function unapproveMergeRequestTool(provider: GitProvider, mrIid: number): AgentTool {
    return {
        name: "unapprove_merge_request",
        description:
            "Withdraw MR approval (GitLab unapprove). Call only after post_merge_request_comment when the change should not be approved. Call at most once.",
        parameters: {
            type: "object",
            properties: {},
            required: [],
        },
        execute: async () => {
            await provider.unapproveMergeRequest(mrIid);
            return { unapproved: true };
        },
    };
}
