import type { AgentTool } from "../../llm/loop.js";
import type { GitProvider } from "../../../git-provider/types.js";
import { buildCommentToolLanguageNote } from "../../shared/prompt/index.js";

import { formatReviewFindingCommentBody } from "../schema/review.schema.js";
import { createSingleLineCommentInputSchema } from "../schema/inline-comment.schema.js";

function isChangedFileNotFoundError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return message.startsWith("Changed file not found in pull request:");
}

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
            "The line must appear in a get_file_diff hunk (+, -, or context). If unsure, put the finding in the summary only.",
            buildCommentToolLanguageNote(language),
        ].join("\n"),
        parameters: createSingleLineCommentInputSchema(language).toJSONSchema(),
        execute: async (args) => {
            const parsed = createSingleLineCommentInputSchema(language).parse(args);
            const { position, ...finding } = parsed;

            const newLine = position.newLine;
            const oldLine = position.oldLine;
            const hasNewLine = newLine !== undefined;
            const hasOldLine = oldLine !== undefined;
            if (hasNewLine && hasOldLine) {
                return { error: "Provide only newLine or oldLine, not both." };
            }
            if (!hasNewLine && !hasOldLine) {
                return { error: "Either newLine or oldLine is required." };
            }
            if (hasNewLine && newLine < 1) {
                return { error: "position.newLine must be >= 1." };
            }
            if (hasOldLine && oldLine < 1) {
                return { error: "position.oldLine must be >= 1." };
            }

            let fileDiff;
            try {
                fileDiff = await provider.fetchFileDiff(prIid, position.newPath);
            } catch (error) {
                if (!isChangedFileNotFoundError(error)) {
                    throw error;
                }
                try {
                    fileDiff = await provider.fetchFileDiff(prIid, position.oldPath);
                } catch (fallbackError) {
                    if (!isChangedFileNotFoundError(fallbackError)) {
                        throw fallbackError;
                    }
                    return { error: `Changed file not found in pull request: ${position.newPath}` };
                }
            }

            if (fileDiff.oldPath !== position.oldPath || fileDiff.newPath !== position.newPath) {
                return {
                    error: `position paths must match get_file_diff (${fileDiff.oldPath} / ${fileDiff.newPath}).`,
                };
            }

            if (!fileDiff.diff) {
                return {
                    error: "No diff patch available for this file (too large or binary). Put this finding in the summary instead.",
                };
            }

            if (fileDiff.newFile && hasOldLine) {
                return { error: "Use newLine for new files, not oldLine." };
            }
            if (fileDiff.deletedFile && hasNewLine) {
                return { error: "Use oldLine for deleted files, not newLine." };
            }

            const newLines = new Set<number>();
            const oldLines = new Set<number>();
            let oldLineNum = 0;
            let newLineNum = 0;
            let inHunk = false;

            for (const line of fileDiff.diff.split("\n")) {
                if (line.startsWith("@@")) {
                    const match = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
                    if (match) {
                        oldLineNum = Number(match[1]);
                        newLineNum = Number(match[2]);
                        inHunk = true;
                    }
                    continue;
                }
                if (!inHunk) {
                    continue;
                }
                if (line.startsWith("\\")) {
                    continue;
                }
                if (line.startsWith(" ")) {
                    newLines.add(newLineNum);
                    oldLines.add(oldLineNum);
                    oldLineNum += 1;
                    newLineNum += 1;
                } else if (line.startsWith("+")) {
                    newLines.add(newLineNum);
                    newLineNum += 1;
                } else if (line.startsWith("-")) {
                    oldLines.add(oldLineNum);
                    oldLineNum += 1;
                }
            }

            if (hasNewLine && !newLines.has(newLine)) {
                return {
                    error: `Line ${newLine} is not in the PR diff hunk for ${position.newPath}. Call get_file_diff and anchor to a + or context line on the new side, or put the finding in the summary.`,
                };
            }
            if (hasOldLine && !oldLines.has(oldLine)) {
                return {
                    error: `Line ${oldLine} is not in the PR diff hunk for ${position.oldPath}. Call get_file_diff and anchor to a - or context line on the old side, or put the finding in the summary.`,
                };
            }

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
