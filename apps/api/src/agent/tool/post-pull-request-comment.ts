import type { AgentTool } from "../loop.js";
import type { GitProvider } from "../../provider/types.js";

export function postPullRequestCommentTool(provider: GitProvider, prIid: number): AgentTool {
    return {
        name: "post_pull_request_comment",
        description:
            "Post the single top-level PR summary note (merge recommendation + short overview). Call exactly ONCE after inline threads (if any). Do not put full duplicate write-ups of every inline finding here.",
        parameters: {
            type: "object",
            properties: {
                body: {
                    type: "string",
                    description: "Markdown body for the summary note only.",
                },
            },
            required: ["body"],
        },
        execute: async (args) => {
            const body = String(args.body);
            const comment = await provider.createPullRequestComment(prIid, body);
            return comment;
        },
    };
}
