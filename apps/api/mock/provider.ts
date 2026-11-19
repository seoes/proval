import type {
    GitComment,
    GitCodeSearchResult,
    GitDiff,
    GitDiffMultiLine,
    GitDiffSingleLine,
    GitIssue,
    GitRepositoryLabel,
    GitPullRequest,
    GitPullRequestVersion,
    GitProvider,
    GitRelatedItem,
    GitRepository,
    GitTree,
    GitUser,
    GitUserPermissionIdentity,
    GitRepositoryListItem,
    GitPullRequestInlineReview,
    GitEmoji,
    GitEmojiTarget,
    ListPaginationOptions,
} from "../src/git-provider/types.js";

export interface MockInput {
    detail: GitPullRequest;
    diffs: GitDiff[];
    /** Conversation comments returned by fetchPullRequestCommentList (default []) */
    commentList?: GitComment[];
    /** Inline review threads returned by fetchPullRequestInlineReviewList (default []) */
    inlineReviewList?: GitPullRequestInlineReview[];
    files?: Record<string, string>;
    tree?: GitTree[];
    version?: GitPullRequestVersion;
    /** Returned by fetchPullRequestReviewerList (default []) */
    reviewers?: string[];
    /** Returned by fetchCurrentUser (default test_bot) */
    currentUser?: GitUser;
    /** Returned by fetchUserPermission (default 5) */
    permissionLevel?: number;
}

const defaultVersion: GitPullRequestVersion = {
    headSha: "head111111111111111111111111111111111111",
    baseSha: "base222222222222222222222222222222222222",
    startSha: "start333333333333333333333333333333333333",
};

export type PostedAction = { type: "comment" | "inline" | "approve" | "unapprove"; body: string };

export class MockProvider implements GitProvider {
    public readonly posted: PostedAction[] = [];
    public readonly emojiList: { target: GitEmojiTarget; emoji: GitEmoji }[] = [];

    constructor(private readonly input: MockInput) {}

    public async fetchCurrentUser(): Promise<GitUser> {
        return this.input.currentUser ?? { username: "test_bot" };
    }

    public async fetchUserPermission(_identity: GitUserPermissionIdentity): Promise<number> {
        return this.input.permissionLevel ?? 5;
    }

    public async fetchRepositoryDetail(): Promise<GitRepository> {
        return {
            id: 1,
            name: "mock-repo",
            description: "Mock repository",
            defaultBranch: "main",
        };
    }

    public async fetchRepositoryPath(): Promise<string> {
        return "mock-org/mock-repo";
    }

    public async fetchGitRepositoryUrl(): Promise<string> {
        return "https://example.com/mock-org/mock-repo.git";
    }

    public async fetchGitRepositoryAuthHeader(): Promise<string> {
        return "Authorization: Bearer mock";
    }

    public getPullRequestHeadFetchRef(prIid: number): string {
        return `refs/pull/${prIid}/head`;
    }

    public getBranchFetchRef(branch: string): string {
        return `refs/heads/${branch}`;
    }

    public async fetchPullRequestDetail(_prIid: number): Promise<GitPullRequest> {
        return this.input.detail;
    }

    public async fetchPullRequestChangedFileCount(_prIid: number): Promise<number> {
        return this.input.diffs.length;
    }

    public async fetchPullRequestCommentList(_prIid: number, options?: ListPaginationOptions) {
        const commentList = [...(this.input.commentList ?? [])].sort(
            (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        );
        if (!options) {
            return commentList;
        }
        const start = (options.page - 1) * options.limit;
        return commentList.slice(start, start + options.limit);
    }

    public async fetchPullRequestReviewerList(_prIid: number): Promise<string[]> {
        return this.input.reviewers ?? [];
    }

    public async fetchIssueDetail(_issueIid: number): Promise<GitIssue> {
        return {
            title: this.input.detail.title,
            description: this.input.detail.description,
            author: this.input.detail.author,
            state: this.input.detail.state === "closed" ? "closed" : "opened",
            labels: [],
        };
    }

    public async fetchRepositoryLabelList(): Promise<GitRepositoryLabel[]> {
        return [
            { name: "bug", description: "Something is not working" },
            { name: "enhancement", description: "New feature or request" },
        ];
    }

    public async addIssueLabel(_issueIid: number, _label: string): Promise<void> {}

    public async fetchIssueComment(_issueIid: number, commentId: number): Promise<GitComment> {
        const comment = (this.input.commentList ?? []).find((item) => item.id === commentId);
        if (comment) {
            return comment;
        }
        return {
            id: commentId,
            body: "test_body",
            author: "test_user",
            createdAt: new Date().toISOString(),
        };
    }

    public async fetchIssueCommentList(_issueIid: number, options?: ListPaginationOptions) {
        const commentList = [...(this.input.commentList ?? [])].sort(
            (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        );
        if (!options) {
            return commentList;
        }
        const start = (options.page - 1) * options.limit;
        return commentList.slice(start, start + options.limit);
    }

    public async createIssueComment(issueIid: number, body: string): Promise<GitComment> {
        return this.createPullRequestComment(issueIid, body);
    }

    public async searchIssueList(_query: string): Promise<GitRelatedItem[]> {
        return [];
    }

    public async searchPullRequestList(_query: string): Promise<GitRelatedItem[]> {
        return [];
    }

    public async searchCodeList(_query: string, _ref: string): Promise<GitCodeSearchResult[]> {
        return [];
    }

    public isCodeSearchSupported(): boolean {
        return true;
    }

    public async searchLineByKeyword(keyword: string, filePath: string, ref: string): Promise<GitCodeSearchResult[]> {
        const content = await this.fetchFileContent(filePath, ref);
        const results: GitCodeSearchResult[] = [];
        const lines = content.split("\n");
        const maxMatches = 50;

        for (let i = 0; i < lines.length && results.length < maxMatches; i++) {
            const line = lines[i];
            if (line.includes(keyword)) {
                results.push({ path: filePath, ref, snippet: line, line: i + 1 });
            }
        }
        return results;
    }

    public async fetchDirectoryTree(_filePath: string, _ref: string, _recursive?: boolean): Promise<GitTree[]> {
        return this.input.tree ?? [];
    }

    public async fetchFileContent(filePath: string, _ref?: string): Promise<string> {
        return this.input.files?.[filePath] ?? `// file not found: ${filePath}`;
    }

    public async fetchPullRequestInlineReview(
        prIid: number,
        inlineReviewId: string,
    ): Promise<GitPullRequestInlineReview> {
        const review = (this.input.inlineReviewList ?? []).find((item) => item.id === inlineReviewId);
        if (review) {
            return review;
        }
        return {
            id: inlineReviewId,
            path: "test_path",
            start: { type: "old", oldLine: 1 },
            end: { type: "old", oldLine: 1 },
            createdAt: new Date().toISOString(),
            isResolved: false,
            commentList: [],
        };
    }

    public async fetchPullRequestInlineReviewList(_prIid: number, options?: ListPaginationOptions) {
        const inlineReviewList = [...(this.input.inlineReviewList ?? [])].sort(
            (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        );
        if (!options) {
            return inlineReviewList;
        }
        const start = (options.page - 1) * options.limit;
        return inlineReviewList.slice(start, start + options.limit);
    }

    public async fetchPullRequestInlineReviewComment(_prIid: number, commentId: number): Promise<GitComment> {
        for (const review of this.input.inlineReviewList ?? []) {
            const comment = review.commentList.find((c) => c.id === commentId);
            if (comment) {
                return comment;
            }
        }
        return {
            id: commentId,
            body: "test_inline_body",
            author: "test_bot",
            createdAt: new Date().toISOString(),
        };
    }

    public async replyToPullRequestInlineReview(
        _prIid: number,
        _inlineReviewId: string,
        body: string,
    ): Promise<GitComment> {
        this.posted.push({ type: "inline", body });
        return {
            id: Date.now(),
            body,
            author: "test_bot",
            createdAt: new Date().toISOString(),
        };
    }

    public async fetchRepositoryList(): Promise<GitRepositoryListItem[]> {
        return [];
    }

    public async fetchPullRequestVersion(_prIid: number): Promise<GitPullRequestVersion> {
        return this.input.version ?? defaultVersion;
    }

    public async createPullRequestComment(_prIid: number, body: string): Promise<GitComment> {
        this.posted.push({ type: "comment", body });
        return {
            id: Date.now(),
            body,
            author: "test_bot",
            createdAt: new Date().toISOString(),
        };
    }

    public takeFlushedInlineCommentList(): GitComment[] {
        return [];
    }

    public async fetchPullRequestComment(_prIid: number, _commentId: number): Promise<GitComment> {
        return {
            id: _commentId,
            body: "test_body",
            author: "test_bot",
            createdAt: new Date().toISOString(),
        };
    }

    public async createCommentToSingleLine(
        _prIid: number,
        body: string,
        _position: GitDiffSingleLine,
    ): Promise<GitComment> {
        this.posted.push({ type: "inline", body });
        return {
            id: Date.now(),
            body,
            author: "test_bot",
            createdAt: new Date().toISOString(),
        };
    }

    public async createCommentToMultiLine(
        _prIid: number,
        body: string,
        _position: GitDiffMultiLine,
    ): Promise<GitComment> {
        this.posted.push({ type: "inline", body });
        return {
            id: Date.now(),
            body,
            author: this.input.currentUser?.username ?? "test_bot",
            createdAt: new Date().toISOString(),
        };
    }

    public async approvePullRequest(_prIid: number): Promise<void> {
        this.posted.push({ type: "approve", body: "" });
    }

    public async unapprovePullRequest(_prIid: number): Promise<void> {
        this.posted.push({ type: "unapprove", body: "" });
    }

    public async assignPullRequestReviewer(_prIid: number): Promise<void> {
        // Webhook-only; no-op for demo
    }

    public async addEmoji(target: GitEmojiTarget, emoji: GitEmoji): Promise<void> {
        this.emojiList.push({ target, emoji });
    }

    public async removeEmoji(_target: GitEmojiTarget, _emoji: GitEmoji): Promise<void> {}
}
