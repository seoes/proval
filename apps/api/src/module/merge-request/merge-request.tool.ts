import { tool } from "ai";
import type { GitProvider } from "../../provider/types.js";
import z from "zod";

export const getMergeRequestDetailTool = (provider: GitProvider, mrIid: number) =>
    tool({
        description: "Get metadata for the current pull/merge request (title, description, branches, author, state).",
        inputSchema: z.object({}),
        execute: async () => {
            const detail = await provider.fetchMergeRequestDetail(mrIid);
            return detail;
        },
    });

export const getMergeRequestDiffTool = (provider: GitProvider, mrIid: number) =>
    tool({
        description:
            "Get the full diff for the current pull/merge request (per-file patches). Prefer calling get_merge_request_detail first for context; use this for line-by-line changes.",
        inputSchema: z.object({}),
        execute: async () => {
            const diff = await provider.fetchMergeRequestDiff(mrIid);
            return diff;
        },
    });

export const getMergeRequestCommentListTool = (provider: GitProvider, mrIid: number) =>
    tool({
        description:
            "Get existing issue and review comments on this pull/merge request. Use to avoid duplicating feedback.",
        inputSchema: z.object({}),
        execute: async () => {
            const comments = await provider.fetchMergeRequestCommentList(mrIid);
            return comments;
        },
    });

export const getDirectoryTreeTool = (provider: GitProvider) =>
    tool({
        description: "Get the directory tree of a repository",
        inputSchema: z.object({
            filePath: z.string().describe("The path of the directory to get the tree of."),
            recursive: z.boolean().describe("Whether to get the tree recursively.").optional(),
        }),
        execute: async ({ filePath, recursive }) => {
            const tree = await provider.fetchDirectoryTree(filePath, recursive);
            return tree;
        },
    });

export const getFileContentTool = (provider: GitProvider, ref: string) =>
    tool({
        description: `Read the full content of a file at the merge request source ref (${ref}). Use for imports, callers, types, and surrounding logic when validating a concern from the diff.`,
        inputSchema: z.object({
            filePath: z.string().describe("Repository-relative path to the file."),
        }),
        execute: async ({ filePath }) => {
            const content = await provider.fetchFileContent(filePath, ref);
            return content;
        },
    });

export const postMergeRequestCommentTool = (provider: GitProvider, mrIid: number) =>
    tool({
        description:
            "Post the single top-level MR summary note (merge recommendation + short overview). Call exactly ONCE after inline threads (if any). Do not put full duplicate write-ups of every inline finding here.",
        inputSchema: z.object({
            body: z.string().describe("Markdown body for the summary note only."),
        }),
        execute: async ({ body }) => {
            const comment = await provider.createMergeRequestComment(mrIid, body);
            return comment;
        },
    });

export const postMergeRequestReplyTool = (provider: GitProvider, mrIid: number, mentionTarget: string) =>
    tool({
        description:
            "Post your reply to the user's comment. The @mention is added automatically — do NOT include it. Call ONCE when done.",
        inputSchema: z.object({
            body: z.string().describe("The reply content in markdown format, without the @mention prefix."),
        }),
        execute: async ({ body }) => {
            const fullBody = `@${mentionTarget}\n\n${body}`;
            const comment = await provider.createMergeRequestComment(mrIid, fullBody);
            return comment;
        },
    });

export const approveMergeRequestTool = (provider: GitProvider, mrIid: number) =>
    tool({
        description:
            "Approve this merge request as the bot user (GitLab MR approval). Call only after post_merge_request_comment, when policy allows approval. Call at most once.",
        inputSchema: z.object({}),
        execute: async () => {
            await provider.approveMergeRequest(mrIid);
            return { approved: true };
        },
    });

export const unapproveMergeRequestTool = (provider: GitProvider, mrIid: number) =>
    tool({
        description:
            "Withdraw MR approval (GitLab unapprove). Call only after post_merge_request_comment when the change should not be approved. Call at most once.",
        inputSchema: z.object({}),
        execute: async () => {
            await provider.unapproveMergeRequest(mrIid);
            return { unapproved: true };
        },
    });

export const getMergeRequestVersionTool = (provider: GitProvider, mrIid: number) =>
    tool({
        description:
            "Get commit SHAs for the current pull/merge request (base, head, start) for inline comment positioning.",
        inputSchema: z.object({}),
        execute: async () => {
            const version = await provider.fetchMergeRequestVersion(mrIid);
            return version;
        },
    });

export const createSingleLineCommentTool = (provider: GitProvider, mrIid: number, options?: { max?: number }) => {
    let used = 0;
    const max = options?.max ?? Infinity;
    return tool({
        description:
            "Create one inline thread on a specific line of the MR diff. Call get_merge_request_version first; use its baseSha/startSha/headSha. Paths must match the diff (old_path/new_path). Prefer newLine for additions/changes on the new file; use oldLine for pure deletions on the old side.",
        inputSchema: z.object({
            body: z.string().describe("Short markdown: severity + concise issue + fix or question."),
            position: z.object({
                baseSha: z.string(),
                headSha: z.string(),
                startSha: z.string(),
                oldPath: z.string(),
                newPath: z.string(),
                newLine: z.coerce.number().optional().describe("1-based line on the new file."),
                oldLine: z.coerce.number().optional().describe("1-based line on the old file."),
            }),
        }),
        execute: async ({ body, position }) => {
            if (used >= max) {
                return {
                    error: `Maximum inline comments (${max}) reached for this review. Put remaining points in the top-level summary only.`,
                };
            }
            used += 1;
            const comment = await provider.createCommentToSingleLine(mrIid, body, position);
            return comment;
        },
    });
};

export const createMultiLineCommentTool = (provider: GitProvider, mrIid: number, options?: { max?: number }) => {
    let used = 0;
    const max = options?.max ?? Infinity;
    const lineSchema = z.object({
        type: z.enum(["old", "new"]).describe("Which side of the diff this endpoint refers to."),
        newLine: z.coerce.number().optional().describe("1-based line on the new file; required when type is 'new'."),
        oldLine: z.coerce.number().optional().describe("1-based line on the old file; required when type is 'old'."),
    });
    return tool({
        description:
            "Create one inline thread that spans MULTIPLE lines of the MR diff. Call get_merge_request_version first; use its baseSha/startSha/headSha. Paths must match the diff (old_path/new_path). Provide start and end positions where each has a side (new/old) and the matching line number; start must come before end on the same side. Prefer covering additions/changes on the new side (type='new' with newLine); use type='old' only for pure deletions.",
        inputSchema: z.object({
            body: z.string().describe("Short markdown: severity + concise issue + fix or question."),
            position: z.object({
                baseSha: z.string(),
                headSha: z.string(),
                startSha: z.string(),
                oldPath: z.string(),
                newPath: z.string(),
                start: lineSchema.describe("First line of the selected range."),
                end: lineSchema.describe("Last line of the selected range (inclusive)."),
            }),
        }),
        execute: async ({ body, position }) => {
            if (used >= max) {
                return {
                    error: `Maximum inline comments (${max}) reached for this review. Put remaining points in the top-level summary only.`,
                };
            }

            const validateEndpoint = (label: "start" | "end", endpoint: { type: "old" | "new"; newLine?: number; oldLine?: number }) => {
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
                    return { error: "position.start line must be <= position.end line on the same side." };
                }
            }

            used += 1;
            const comment = await provider.createCommentToMultiLine(mrIid, body, position);
            return comment;
        },
    });
};
