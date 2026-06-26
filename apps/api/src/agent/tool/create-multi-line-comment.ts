import type { AgentTool } from "../llm/loop.js";
import type { GitProvider } from "../../git-provider/types.js";
import { buildCommentToolLanguageNote } from "../prompt/index.js";
import { formatReviewFindingCommentBody } from "../schema/review.schema.js";
import { createMultiLineCommentInputSchema } from "../schema/inline-comment.schema.js";

export function createMultiLineCommentTool(
    provider: GitProvider,
    prIid: number,
    language: string,
    baseSha: string,
    headSha: string,
    startSha: string,
): AgentTool {
    return {
        name: "create_multi_line_comment",
        description: [
            "Create one inline thread that spans MULTIPLE lines of the PR diff.",
            "Use this for findings that span 2+ consecutive lines.",
            "Do NOT use this for findings that pin to exactly one line — use create_single_line_comment for that.",
            "Paths must match the diff (old_path/new_path).",
            "Provide start and end positions where each has a side (new/old) and the matching line number; start must come before end on the same side.",
            "Prefer covering additions/changes on the new side (type='new' with newLine).",
            "Use type='old' only for pure deletions on the old side.",
            buildCommentToolLanguageNote(language),
        ].join("\n"),
        parameters: createMultiLineCommentInputSchema(language).toJSONSchema(),
        execute: async (args) => {
            const parsed = createMultiLineCommentInputSchema(language).parse(args);
            const { position, ...finding } = parsed;
            const body = formatReviewFindingCommentBody(finding);

            const validateEndpoint = (
                label: "start" | "end",
                endpoint: { type: "old" | "new"; newLine?: number; oldLine?: number },
            ) => {
                if (endpoint.type === "new" && endpoint.newLine === undefined) {
                    return `position.${label}.newLine is required when position.${label}.type is 'new'.`;
                }
                if (endpoint.type === "old" && endpoint.oldLine === undefined) {
                    return `position.${label}.oldLine is required when position.${label}.type is 'old'.`;
                }
                return null;
            };

            const startError = validateEndpoint("start", position.start);
            if (startError) return { error: startError };

            const endError = validateEndpoint("end", position.end);
            if (endError) return { error: endError };

            if (position.start.type === position.end.type) {
                const startLine = position.start.type === "new" ? position.start.newLine! : position.start.oldLine!;
                const endLine = position.end.type === "new" ? position.end.newLine! : position.end.oldLine!;
                if (startLine > endLine) {
                    return {
                        error: "position.start line must be <= position.end line on the same side.",
                    };
                }
            }

            const comment = await provider.createCommentToMultiLine(prIid, body, {
                baseSha,
                headSha,
                startSha,
                oldPath: position.oldPath,
                newPath: position.newPath,
                start: position.start,
                end: position.end,
            });
            return comment;
        },
    };
}
