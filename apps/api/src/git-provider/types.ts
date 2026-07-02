export type ListPaginationOptions = { page: number; limit: number };

export interface GitPullRequest {
    title: string;
    description: string | null;
    sourceBranch: string;
    targetBranch: string;
    author: string;
    state: GitPullRequestState;
}

export type GitPullRequestState = "opened" | "closed" | "merged" | "locked";

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
    ref: string;
    snippet: string;
    line?: number;
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

export interface GitPullRequestVersion {
    headSha: string;
    baseSha: string;
    startSha: string;
}

export interface GitComment {
    id: number;
    body: string;
    author: string;
    createdAt: string;
}

export interface GitPullRequestInlineReview {
    id: string;
    path: string;
    oldPath?: string;
    start: GitDiffLine;
    end: GitDiffLine;
    createdAt: string;
    isResolved: boolean;
    commentList: GitComment[];
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

export interface GitRepositoryListItem {
    id: number;
    name: string;
    fullName: string;
    description: string | null;
    defaultBranch: string;
}

export interface GitProvider {
    fetchCurrentUser(): Promise<GitUser>;
    fetchRepositoryDetail(): Promise<GitRepository>;
    fetchPullRequestDetail(prIid: number): Promise<GitPullRequest>;
    fetchChangedFileList(prIid: number): Promise<GitChangedFile[]>;
    /** Read one changed file's patch from the PR. Accepts either oldPath or newPath. */
    fetchFileDiff(prIid: number, filePath: string): Promise<GitDiff>;

    // Pull Request conversation comment (PR timeline / issue_comment)
    fetchPullRequestComment(prIid: number, commentId: number): Promise<GitComment>;
    fetchPullRequestCommentList(prIid: number, options?: ListPaginationOptions): Promise<GitComment[]>;

    // Pull Request inline review
    fetchPullRequestInlineReview(prIid: number, inlineReviewId: string): Promise<GitPullRequestInlineReview>;
    fetchPullRequestInlineReviewList(
        prIid: number,
        options?: ListPaginationOptions,
    ): Promise<GitPullRequestInlineReview[]>;
    fetchPullRequestInlineReviewComment(prIid: number, commentId: number): Promise<GitComment>;
    replyToPullRequestInlineReview(prIid: number, inlineReviewId: string, body: string): Promise<GitComment>;

    fetchPullRequestReviewerList(prIid: number): Promise<string[]>;
    fetchIssueDetail(issueIid: number): Promise<GitIssue>;

    // Issue Comment
    fetchIssueCommentList(issueIid: number, options?: ListPaginationOptions): Promise<GitComment[]>;
    createIssueComment(issueIid: number, body: string): Promise<GitComment>;
    searchIssueList(query: string): Promise<GitRelatedItem[]>;
    searchPullRequestList(query: string): Promise<GitRelatedItem[]>;
    searchCodeList(query: string, ref: string): Promise<GitCodeSearchResult[]>;
    searchLineByKeyword(keyword: string, filePath: string, ref: string): Promise<GitCodeSearchResult[]>;
    isCodeSearchSupported(): boolean;

    fetchDirectoryTree(filePath: string, ref: string, recursive?: boolean): Promise<GitTree[]>;
    /** Read file at ref (branch name or commit SHA). Omit ref only when no MR context. */
    fetchFileContent(filePath: string, ref?: string): Promise<string>;
    createPullRequestComment(prIid: number, body: string): Promise<GitComment>;

    fetchPullRequestVersion(prIid: number): Promise<GitPullRequestVersion>;
    createCommentToSingleLine(prIid: number, body: string, position: GitDiffSingleLine): Promise<GitComment>;
    createCommentToMultiLine(prIid: number, body: string, position: GitDiffMultiLine): Promise<GitComment>;
    approvePullRequest(prIid: number): Promise<void>;
    unapprovePullRequest(prIid: number): Promise<void>;
    assignPullRequestReviewer(prIid: number): Promise<void>;
    fetchRepositoryList(): Promise<GitRepositoryListItem[]>;
    fetchRepositoryPath(): Promise<string>;
}
