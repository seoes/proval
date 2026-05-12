export interface GitMergeRequest {
    title: string;
    description: string | null;
    sourceBranch: string;
    targetBranch: string;
    author: string;
    state: GitMergeRequestState;
}

export type GitMergeRequestState = "opened" | "closed" | "merged" | "locked";

export interface GitIssue {
    title: string;
    description: string | null;
    author: string;
    state: GitIssueState;
    labels: string[];
}

export type GitIssueState = "opened" | "closed" | "locked";

export interface GitRepository {
    id: number;
    name: string;
    description: string | null;
    defaultBranch: string;
}

export interface GitRelatedItem {
    number: number;
    title: string;
    description: string | null;
    state: "opened" | "closed" | "merged";
    author: string;
    url: string;
}

export interface GitCodeSearchResult {
    path: string;
    name: string;
    ref: string;
    snippet: string;
    url?: string;
}

// git diff
export interface GitChangedFile {
    oldPath: string;
    newPath: string;
    newFile: boolean;
    renamedFile: boolean;
    deletedFile: boolean;
}

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
    /** Line on the new file side (added/changed lines). GitLab expects a number. */
    newLine?: number;
    /** Line on the old file side (deletions / old side of diff). */
    oldLine?: number;
}

export interface GitDiffMultiLine extends GitDiffBase {
    start: GitDiffLine;
    end: GitDiffLine;
}

export interface GitDiffLine {
    type: "old" | "new";
    oldLine?: number;
    newLine?: number;
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

export interface GitTree {
    name: string;
    path: string;
    type: "file" | "directory";
}

// TODO: code review on specific line
// export interface GitCodeReview {}

export interface GitUser {
    username: string;
}

export interface GitProvider {
    fetchCurrentUser(): Promise<GitUser>;
    fetchRepositoryDetail(): Promise<GitRepository>;
    fetchMergeRequestDetail(mrIid: number): Promise<GitMergeRequest>;
    fetchChangedFileList(mrIid: number): Promise<GitChangedFile[]>;
    /** Read one changed file's patch from the MR. Accepts either oldPath or newPath. */
    fetchFileDiff(mrIid: number, filePath: string): Promise<GitDiff>;
    fetchMergeRequestCommentList(mrIid: number): Promise<GitComment[]>;
    fetchMergeRequestReviewerList(mrIid: number): Promise<string[]>;
    fetchIssueDetail(issueIid: number): Promise<GitIssue>;
    fetchIssueCommentList(issueIid: number): Promise<GitComment[]>;
    createIssueComment(issueIid: number, body: string): Promise<GitComment>;
    searchIssueList(query: string): Promise<GitRelatedItem[]>;
    searchMergeRequestList(query: string): Promise<GitRelatedItem[]>;
    searchCodeList(query: string, ref: string): Promise<GitCodeSearchResult[]>;
    fetchDirectoryTree(filePath: string, ref: string, recursive?: boolean): Promise<GitTree[]>;
    /** Read file at ref (branch name or commit SHA). Omit ref only when no MR context. */
    fetchFileContent(filePath: string, ref?: string): Promise<string>;
    createMergeRequestComment(mrIid: number, body: string): Promise<GitComment>;
    fetchMergeRequestVersion(mrIid: number): Promise<GitMergeRequestVersion>;
    createCommentToSingleLine(mrIid: number, body: string, position: GitDiffSingleLine): Promise<GitComment>;
    createCommentToMultiLine(mrIid: number, body: string, position: GitDiffMultiLine): Promise<GitComment>;
    approveMergeRequest(mrIid: number): Promise<void>;
    unapproveMergeRequest(mrIid: number): Promise<void>;
    assignMergeRequestReviewer(mrIid: number): Promise<void>;
}
