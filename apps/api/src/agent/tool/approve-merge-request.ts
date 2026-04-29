import type { AgentTool } from "../loop.js";
import type { GitProvider } from "../../provider/types.js";

export function approveMergeRequestTool(provider: GitProvider, mrIid: number): AgentTool {
    return {
        name: "approve_merge_request",
        description:
            "Approve this merge request as the bot user (GitLab MR approval). Call only after post_merge_request_comment, when policy allows approval. Call at most once.",
        parameters: {
            type: "object",
            properties: {},
            required: [],
        },
        execute: async () => {
            await provider.approveMergeRequest(mrIid);
            return { approved: true };
        },
    };
}
