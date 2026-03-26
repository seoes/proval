import type { RepositoryTreeSchema } from "@gitbeaker/rest";

export interface GitMergeRequest {
    title: string;
    description: string | null;
    sourceBranch: string;
    targetBranch: string;
    author: string;
    state: GitMergeRequestState;
}

export type GitMergeRequestState = "opened" | "closed" | "merged" | "locked";

// git diff
export interface GitDiff {
    oldPath: string;
    newPath: string;
    newFile: boolean;
    renamedFile: boolean;
    deletedFile: boolean;
    diff: string;
}

export interface GitDiffBase {
    baseSha: string;
    headSha: string;
    startSha: string;
    oldPath: string;
    newPath: string;
}

export interface GitDiffSingleLine extends GitDiffBase {
    newLine?: string;
    oldLine?: string;
}

export interface GitMergeRequestVersion {
    headSha: string;
    baseSha: string;
    startSha: string;
}

// comment and discussion
export interface GitComment {
    id: number;
    body: string;
    author: string;
    createdAt: string;
}

// commit
export interface GitCommit {
    id: string;
    message: string;
    author: string;
    createdAt: string;
}

// file content
export interface GitFile {
    path: string;
    content: string;
}

export interface GitTree extends RepositoryTreeSchema {}

// TODO: code review on specific line
// export interface GitCodeReview {}

export interface GitUser {
    username: string;
}

export interface GitProvider {
    fetchCurrentUser(): Promise<GitUser>;
    fetchMergeRequestDetail(mrIid: number): Promise<GitMergeRequest>;
    fetchMergeRequestDiff(mrIid: number, ref?: string): Promise<GitDiff[]>;
    fetchMergeRequestCommentList(mrIid: number): Promise<GitComment[]>;
    fetchMergeRequestReviewerList(mrIid: number): Promise<string[]>;
    fetchDirectoryTree(filePath: string, recursive?: boolean): Promise<GitTree[]>;
    fetchFileContent(filePath: string): Promise<string>;
    createMergeRequestComment(mrIid: number, body: string): Promise<GitComment>;
    fetchMergeRequestVersion(mrIid: number): Promise<GitMergeRequestVersion>;
    createCommentToSingleLine(mrIid: number, body: string, position: GitDiffSingleLine): Promise<GitComment>;
}
