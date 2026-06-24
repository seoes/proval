import type { AgentTool } from "../llm/loop.js";
import type { GitProvider } from "../../git-provider/types.js";
import { buildCommentToolLanguageNote, buildCommentBodyDescription } from "../prompt/index.js";

export function postIssueCommentTool(provider: GitProvider, issueIid: number, language: string): AgentTool {
    return {
        name: "post_issue_comment",
        description: [
            "Post the single top-level issue comment after you have gathered enough context. Call exactly once.",
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
            const comment = await provider.createIssueComment(issueIid, body);
            return comment;
        },
    };
}
