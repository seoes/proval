import type { AgentTool } from "../../llm/loop.js";
import type { GitDiffLine, GitProvider } from "../../../git-provider/types.js";
import type { Workspace } from "../../../git-provider/workspace.js";
import { buildCommentToolLanguageNote } from "../../shared/prompt/index.js";
import { formatReviewFindingCommentBody } from "../schema/review.schema.js";
import { createMultiLineCommentInputSchema } from "../schema/inline-comment.schema.js";
import { CommentService } from "../../../api/comment/comment.service.js";

function isChangedFileNotFoundError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return message.startsWith("Changed file not found in pull request:");
}

export function createMultiLineCommentTool(
    provider: GitProvider,
    workspace: Workspace,
    prIid: number,
    language: string,
    baseSha: string,
    headSha: string,
    startSha: string,
    activityId: number,
): AgentTool {
    const commentService = new CommentService();
    return {
        name: "create_multi_line_comment",
        description: [
            "Create one inline review that spans MULTIPLE lines of the PR diff.",
            "Use this for findings that span 2+ consecutive lines.",
            "Do NOT use this for findings that pin to exactly one line — use create_single_line_comment for that.",
            "Paths must match the diff (old_path/new_path).",
            "Provide start and end positions where each has a side (new/old) and the matching line number. Only the line number for that side is required. Start must come before end on the same side.",
            "Prefer covering additions/changes on the new side (type='new' with newLine).",
            "Use type='old' only for pure deletions on the old side.",
            "Start and end lines must appear in a get_file_diff hunk with against=start (+, -, or context). Do not anchor to against=base hunks. If unsure, put the finding in the summary only.",
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

            let fileDiff;
            try {
                fileDiff = await workspace.getFileDiff(position.newPath, "start");
            } catch (error) {
                if (!isChangedFileNotFoundError(error)) {
                    throw error;
                }
                try {
                    fileDiff = await workspace.getFileDiff(position.oldPath, "start");
                } catch (fallbackError) {
                    if (!isChangedFileNotFoundError(fallbackError)) {
                        throw fallbackError;
                    }
                    return { error: `Changed file not found in pull request: ${position.newPath}` };
                }
            }

            if (!fileDiff.diff) {
                return {
                    error: "No diff patch available for this file (too large or binary). Put this finding in the summary instead.",
                };
            }

            const newLines = new Set<number>();
            const oldLines = new Set<number>();
            const contextOldByNew = new Map<number, number>();
            const contextNewByOld = new Map<number, number>();
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
                    contextOldByNew.set(newLineNum, oldLineNum);
                    contextNewByOld.set(oldLineNum, newLineNum);
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

            const resolveEndpoint = (endpoint: {
                type: "old" | "new";
                newLine?: number;
                oldLine?: number;
            }): { error: string } | { line: GitDiffLine } => {
                if (endpoint.type === "new") {
                    const newLine = endpoint.newLine!;
                    if (!newLines.has(newLine)) {
                        return {
                            error: `Line ${newLine} is not in the PR diff hunk for ${position.newPath}. Call get_file_diff and anchor to a + or context line on the new side, or put the finding in the summary.`,
                        };
                    }
                    return { line: { type: "new", newLine, oldLine: contextOldByNew.get(newLine) } };
                }
                const oldLine = endpoint.oldLine!;
                if (!oldLines.has(oldLine)) {
                    return {
                        error: `Line ${oldLine} is not in the PR diff hunk for ${position.oldPath}. Call get_file_diff and anchor to a - or context line on the old side, or put the finding in the summary.`,
                    };
                }
                return { line: { type: "old", oldLine, newLine: contextNewByOld.get(oldLine) } };
            };

            const resolvedStart = resolveEndpoint(position.start);
            if ("error" in resolvedStart) return { error: resolvedStart.error };
            const resolvedEnd = resolveEndpoint(position.end);
            if ("error" in resolvedEnd) return { error: resolvedEnd.error };

            const comment = await provider.createCommentToMultiLine(prIid, body, {
                baseSha,
                headSha,
                startSha,
                oldPath: position.oldPath,
                newPath: position.newPath,
                start: resolvedStart.line,
                end: resolvedEnd.line,
            });
            await commentService.create(activityId, "inline_review", comment.id, comment.body);
            return comment;
        },
    };
}
