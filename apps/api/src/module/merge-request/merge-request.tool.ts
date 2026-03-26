import { tool } from "ai";
import type { GitProvider } from "../../provider/types.js";
import z from "zod";

export const getMergeRequestDetailTool = (provider: GitProvider, mrIid: number) =>
    tool({
        description: "Get the details of a merge request",
        inputSchema: z.object({}),
        execute: async () => {
            const detail = await provider.fetchMergeRequestDetail(mrIid);
            return detail;
        },
    });

export const getMergeRequestDiffTool = (provider: GitProvider, mrIid: number) =>
    tool({
        description:
            "Get merge request metadata: title, description, labels, branches, author, diff_refs. Call this first.",
        inputSchema: z.object({}),
        execute: async () => {
            const diff = await provider.fetchMergeRequestDiff(mrIid);
            return diff;
        },
    });

export const getMergeRequestCommentListTool = (provider: GitProvider, mrIid: number) =>
    tool({
        description: "Get existing review discussions and comments on this MR. Use to avoid duplicating feedback.",
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

export const getFileContentTool = (provider: GitProvider) =>
    tool({
        description:
            "Read the full content of a file from the repository. Use to understand context — imports, related functions, types.",
        inputSchema: z.object({
            filePath: z.string().describe("The path of the file to get the content of."),
        }),
        execute: async ({ filePath }) => {
            const content = await provider.fetchFileContent(filePath);
            return content;
        },
    });

export const postMergeRequestCommentTool = (provider: GitProvider, mrIid: number) =>
    tool({
        description: "Submit your final code review. Posts a summary + optional inline comments. Call ONCE when done.",
        inputSchema: z.object({
            body: z.string().describe("The comment body, should be in markdown format."),
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

export const getMergeRequestVersionTool = (provider: GitProvider, mrIid: number) =>
    tool({
        description: "Get the version of a merge request",
        inputSchema: z.object({}),
        execute: async () => {
            const version = await provider.fetchMergeRequestVersion(mrIid);
            return version;
        },
    });

export const createSingleLineCommentTool = (provider: GitProvider, mrIid: number) =>
    tool({
        description: "Create a single line comment on a merge request with a specific line number",
        inputSchema: z.object({
            body: z.string().describe("The comment body, should be in markdown format."),
            position: z.object({
                baseSha: z.string().describe("The base SHA of the comment."),
                headSha: z.string().describe("The head SHA of the comment."),
                startSha: z.string().describe("The start SHA of the comment."),
                oldPath: z.string().describe("The old path of the comment."),
                newPath: z.string().describe("The new path of the comment."),
                newLine: z.string().describe("The new line number of the comment.").optional(),
                oldLine: z.string().describe("The old line number of the comment.").optional(),
            }),
        }),
        execute: async ({ body, position }) => {
            const comment = await provider.createCommentToSingleLine(mrIid, body, position);
            return comment;
        },
    });
