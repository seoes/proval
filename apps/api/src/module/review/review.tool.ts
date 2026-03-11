import { tool } from "ai";
import type { GitProvider } from "../../provider/types.js";
import z from "zod";

// Merge Request Detail Tool
export const getMergeRequestDetailTool = (provider: GitProvider, mrIid: number) =>
    tool({
        description: "Get the details of a merge request",
        inputSchema: z.object({}),
        execute: async () => {
            const detail = await provider.fetchMergeRequestDetail(mrIid);
            return detail;
        },
    });

// Merge Request Diff Tool
export const getMergeRequestDiffTool = (provider: GitProvider, mrIid: number) =>
    tool({
        description:
            "Get merge request metadata: title, description, labels, branches, author, diff_refs. Call this first.",
        inputSchema: z.object({}),
        execute: async () => {
            console.log("@@@ TOOL: Fetching merge request diff");
            const diff = await provider.fetchMergeRequestDiff(mrIid);
            return diff;
        },
    });

export const getMergeRequestCommentListTool = (provider: GitProvider, mrIid: number) =>
    tool({
        description: "Get existing review discussions and comments on this MR. Use to avoid duplicating feedback.",
        inputSchema: z.object({}),
        execute: async () => {
            console.log("@@@ TOOL: Fetching merge request comment list");
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
            console.log("@@@ TOOL: Fetching directory tree");
            const tree = await provider.fetchDirectoryTree(filePath, recursive);
            return tree;
        },
    });

// File Content Tool
export const getFileContentTool = (provider: GitProvider) =>
    tool({
        description:
            "Read the full content of a file from the repository. Use to understand context — imports, related functions, types.",
        inputSchema: z.object({
            filePath: z.string().describe("The path of the file to get the content of."),
        }),
        execute: async ({ filePath }) => {
            console.log("@@@ TOOL: Fetching file content");
            const content = await provider.fetchFileContent(filePath);
            return content;
        },
    });

// Comment Tool
export const postMergeRequestCommentTool = (provider: GitProvider, mrIid: number) =>
    tool({
        description: "Submit your final code review. Posts a summary + optional inline comments. Call ONCE when done.",
        inputSchema: z.object({
            body: z.string().describe("The comment body, should be in markdown format."),
        }),
        execute: async ({ body }) => {
            console.log("@@@ TOOL: Posting merge request comment");
            const comment = await provider.createMergeRequestComment(mrIid, body);
            return comment;
        },
    });
