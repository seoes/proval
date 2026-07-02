import type { AgentTool } from "../../llm/loop.js";
import type { GitProvider } from "../../../git-provider/types.js";
import { buildCommentToolLanguageNote } from "../../shared/prompt/index.js";

import { formatReviewFindingCommentBody } from "../schema/review.schema.js";
import { createSingleLineCommentInputSchema } from "../schema/inline-comment.schema.js";

export function createSingleLineCommentTool(
    provider: GitProvider,
    prIid: number,
    language: string,
    baseSha: string,
    headSha: string,
    startSha: string,
): AgentTool {
    return {
        name: "create_single_line_comment",
        description: [
            "Create one inline review on a single line of the PR diff.",
            "Use this for findings that pin to exactly one line.",
            "Do NOT use this for findings spanning 2+ consecutive lines — use create_multi_line_comment for that.",
            "Paths must match the diff (old_path/new_path).",
            "Prefer newLine for additions/changes on the new file.",
            "Use oldLine for pure deletions on the old side.",
            buildCommentToolLanguageNote(language),
        ].join("\n"),
        parameters: createSingleLineCommentInputSchema(language).toJSONSchema(),
        execute: async (args) => {
            const parsed = createSingleLineCommentInputSchema(language).parse(args);
            const { position, ...finding } = parsed;
            const body = formatReviewFindingCommentBody(finding);

            const comment = await provider.createCommentToSingleLine(prIid, body, {
                baseSha,
                headSha,
                startSha,
                oldPath: position.oldPath,
                newPath: position.newPath,
                newLine: position.newLine,
                oldLine: position.oldLine,
            });
            return comment;
        },
    };
}
