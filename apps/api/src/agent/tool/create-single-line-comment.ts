import type { AgentTool } from "../loop.js";
import type { GitProvider } from "../../provider/types.js";
import { buildCommentToolLanguageNote } from "../../module/prompt/index.js";

import { createSingleLineCommentInputSchema, formatReviewFindingCommentBody } from "../review.js";

export function createSingleLineCommentTool(provider: GitProvider, prIid: number, language: string): AgentTool {
    return {
        name: "create_single_line_comment",
        description: [
            "Create one inline thread on a single line of the PR diff.",
            "Use this for findings that pin to exactly one line.",
            "Do NOT use this for findings spanning 2+ consecutive lines — use create_multi_line_comment for that.",
            "Paths must match the diff (old_path/new_path).",
            "Prefer newLine for additions/changes on the new file.",
            "Use oldLine for pure deletions on the old side.",
            "Use baseSha/startSha/headSha.",
            buildCommentToolLanguageNote(language),
        ].join("\n"),
        parameters: createSingleLineCommentInputSchema(language).toJSONSchema(),
        execute: async (args) => {
            const parsed = createSingleLineCommentInputSchema(language).parse(args);
            const { position, ...finding } = parsed;
            const body = formatReviewFindingCommentBody(finding);

            const comment = await provider.createCommentToSingleLine(prIid, body, {
                baseSha: position.baseSha,
                headSha: position.headSha,
                startSha: position.startSha,
                oldPath: position.oldPath,
                newPath: position.newPath,
                newLine: position.newLine,
                oldLine: position.oldLine,
            });
            return comment;
        },
    };
}
