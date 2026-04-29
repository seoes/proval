import type { AgentTool } from "../loop.js";
import type { GitProvider } from "../../provider/types.js";

export function createSingleLineCommentTool(provider: GitProvider, mrIid: number): AgentTool {
    return {
        name: "create_single_line_comment",
        description:
            "Create one inline thread on a specific line of the MR diff. Call get_merge_request_version first; use its baseSha/startSha/headSha. Paths must match the diff (old_path/new_path). Prefer newLine for additions/changes on the new file; use oldLine for pure deletions on the old side.",
        parameters: {
            type: "object",
            properties: {
                body: {
                    type: "string",
                    description: "Short markdown: severity + concise issue + fix or question.",
                },
                position: {
                    type: "object",
                    properties: {
                        baseSha: { type: "string" },
                        headSha: { type: "string" },
                        startSha: { type: "string" },
                        oldPath: { type: "string" },
                        newPath: { type: "string" },
                        newLine: { type: "number", description: "1-based line on the new file." },
                        oldLine: { type: "number", description: "1-based line on the old file." },
                    },
                    required: ["baseSha", "headSha", "startSha", "oldPath", "newPath"],
                },
            },
            required: ["body", "position"],
        },
        execute: async (args) => {
            const body = String(args.body);
            const position = args.position as Record<string, unknown>;
            const comment = await provider.createCommentToSingleLine(mrIid, body, {
                baseSha: String(position.baseSha),
                headSha: String(position.headSha),
                startSha: String(position.startSha),
                oldPath: String(position.oldPath),
                newPath: String(position.newPath),
                newLine: position.newLine !== undefined ? Number(position.newLine) : undefined,
                oldLine: position.oldLine !== undefined ? Number(position.oldLine) : undefined,
            });
            return comment;
        },
    };
}
