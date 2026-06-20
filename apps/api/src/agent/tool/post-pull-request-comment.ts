import type { AgentTool } from "../llm/loop.js";
import type { GitProvider } from "../../git-provider/types.js";
import { buildCommentToolLanguageNote, buildCommentBodyDescription } from "../prompt/index.js";

export function postPullRequestCommentTool(provider: GitProvider, prIid: number, language: string): AgentTool {
    return {
        name: "post_pull_request_comment",
        description: [
            "Post the single top-level PR summary note (merge recommendation + short overview). Call exactly ONCE after inline threads (if any). Do not put full duplicate write-ups of every inline finding here.",
            buildCommentToolLanguageNote(language),
        ].join(" "),
        parameters: {
            type: "object",
            properties: {
                body: {
                    type: "string",
                    description: buildCommentBodyDescription(language),
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
