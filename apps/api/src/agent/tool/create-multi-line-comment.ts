import type { AgentTool } from "../loop.js";
import type { GitProvider } from "../../provider/types.js";
import { buildCommentBodyDescription, buildCommentToolLanguageNote } from "../../module/prompt/tool/comment-language.js";

export function createMultiLineCommentTool(provider: GitProvider, prIid: number, language: string): AgentTool {
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
            "Use baseSha/startSha/headSha.",
            buildCommentToolLanguageNote(language),
        ].join("\n"),
        parameters: {
            type: "object",
            properties: {
                body: {
                    type: "string",
                    description: buildCommentBodyDescription(language),
                },
                position: {
                    type: "object",
                    properties: {
                        baseSha: { type: "string" },
                        headSha: { type: "string" },
                        startSha: { type: "string" },
                        oldPath: { type: "string" },
                        newPath: { type: "string" },
                        start: {
                            type: "object",
                            properties: {
                                type: { type: "string", enum: ["old", "new"] },
                                newLine: { type: "number" },
                                oldLine: { type: "number" },
                            },
                            required: ["type"],
                        },
                        end: {
                            type: "object",
                            properties: {
                                type: { type: "string", enum: ["old", "new"] },
                                newLine: { type: "number" },
                                oldLine: { type: "number" },
                            },
                            required: ["type"],
                        },
                    },
                    required: ["baseSha", "headSha", "startSha", "oldPath", "newPath", "start", "end"],
                },
            },
            required: ["body", "position"],
        },
        execute: async (args) => {
            const body = String(args.body);
            const position = args.position as Record<string, unknown>;

            const start = position.start as Record<string, unknown>;
            const end = position.end as Record<string, unknown>;

            const validateEndpoint = (
                label: "start" | "end",
                endpoint: { type: string; newLine?: number; oldLine?: number },
            ) => {
                if (endpoint.type === "new" && endpoint.newLine === undefined) {
                    return `position.${label}.newLine is required when position.${label}.type is 'new'.`;
                }
                if (endpoint.type === "old" && endpoint.oldLine === undefined) {
                    return `position.${label}.oldLine is required when position.${label}.type is 'old'.`;
                }
                return null;
            };

            const startError = validateEndpoint("start", {
                type: String(start.type) as "old" | "new",
                newLine: start.newLine !== undefined ? Number(start.newLine) : undefined,
                oldLine: start.oldLine !== undefined ? Number(start.oldLine) : undefined,
            });
            if (startError) return { error: startError };

            const endError = validateEndpoint("end", {
                type: String(end.type) as "old" | "new",
                newLine: end.newLine !== undefined ? Number(end.newLine) : undefined,
                oldLine: end.oldLine !== undefined ? Number(end.oldLine) : undefined,
            });
            if (endError) return { error: endError };

            if (start.type === end.type) {
                const startLine = start.type === "new" ? Number(start.newLine) : Number(start.oldLine);
                const endLine = end.type === "new" ? Number(end.newLine) : Number(end.oldLine);
                if (startLine > endLine) {
                    return {
                        error: "position.start line must be <= position.end line on the same side.",
                    };
                }
            }

            const comment = await provider.createCommentToMultiLine(prIid, body, {
                baseSha: String(position.baseSha),
                headSha: String(position.headSha),
                startSha: String(position.startSha),
                oldPath: String(position.oldPath),
                newPath: String(position.newPath),
                start: {
                    type: String(start.type) as "old" | "new",
                    newLine: start.newLine !== undefined ? Number(start.newLine) : undefined,
                    oldLine: start.oldLine !== undefined ? Number(start.oldLine) : undefined,
                },
                end: {
                    type: String(end.type) as "old" | "new",
                    newLine: end.newLine !== undefined ? Number(end.newLine) : undefined,
                    oldLine: end.oldLine !== undefined ? Number(end.oldLine) : undefined,
                },
            });
            return comment;
        },
    };
}
