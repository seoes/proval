import type {
    GitComment,
    GitChangedFile,
    GitCodeSearchResult,
    GitDiff,
    GitDiffMultiLine,
    GitDiffSingleLine,
    GitIssue,
    GitPullRequest,
    GitPullRequestVersion,
    GitProvider,
    GitRelatedItem,
    GitRepository,
    GitTree,
    GitUser,
    GitRepositoryListItem,
} from "../src/git-provider/types.js";

export interface TestInput {
    detail: GitPullRequest;
    diffs: GitDiff[];
    comments?: GitComment[];
    files?: Record<string, string>;
    tree?: GitTree[];
    version?: GitPullRequestVersion;
    /** Returned by fetchPullRequestReviewerList (default []) */
    reviewers?: string[];
    /** Returned by fetchCurrentUser (default test_bot) */
    currentUser?: GitUser;
}

const defaultVersion: GitPullRequestVersion = {
    headSha: "head111111111111111111111111111111111111",
    baseSha: "base222222222222222222222222222222222222",
    startSha: "start333333333333333333333333333333333333",
};

export type PostedAction = { type: "comment" | "inline" | "approve" | "unapprove"; body: string };

export class MockProvider implements GitProvider {
    public readonly posted: PostedAction[] = [];

    constructor(private readonly input: TestInput) {}

    async fetchCurrentUser(): Promise<GitUser> {
        return this.input.currentUser ?? { username: "test_bot" };
    }

    async fetchRepositoryDetail(): Promise<GitRepository> {
        return {
            id: 1,
            name: "mock-repo",
            description: "Mock repository",
            defaultBranch: "main",
        };
    }

    async fetchRepositoryPath(): Promise<string> {
        return "mock-org/mock-repo";
    }

    async fetchPullRequestDetail(_prIid: number): Promise<GitPullRequest> {
        return this.input.detail;
    }

    async fetchChangedFileList(_prIid: number): Promise<GitChangedFile[]> {
        return this.input.diffs.map(({ oldPath, newPath, newFile, renamedFile, deletedFile }) => ({
            oldPath,
            newPath,
            newFile,
            renamedFile,
            deletedFile,
        }));
    }

    async fetchFileDiff(_prIid: number, filePath: string): Promise<GitDiff> {
        const diff = this.input.diffs.find((item) => item.newPath === filePath || item.oldPath === filePath);
        if (!diff) {
            throw new Error(`Changed file not found in pull request: ${filePath}`);
        }
        return diff;
    }

    async fetchPullRequestCommentList(_prIid: number): Promise<GitComment[]> {
        return this.input.comments ?? [];
    }

    async fetchPullRequestReviewerList(_prIid: number): Promise<string[]> {
        return this.input.reviewers ?? [];
    }

    async fetchIssueDetail(_issueIid: number): Promise<GitIssue> {
        return {
            title: this.input.detail.title,
            description: this.input.detail.description,
            author: this.input.detail.author,
            state: this.input.detail.state === "closed" ? "closed" : "opened",
            labels: [],
        };
    }

    async fetchIssueCommentList(_issueIid: number): Promise<GitComment[]> {
        return this.input.comments ?? [];
    }

    async createIssueComment(issueIid: number, body: string): Promise<GitComment> {
        return this.createPullRequestComment(issueIid, body);
    }

    async searchIssueList(_query: string): Promise<GitRelatedItem[]> {
        return [];
    }

    async searchPullRequestList(_query: string): Promise<GitRelatedItem[]> {
        return [];
    }

    async searchCodeList(_query: string, _ref: string): Promise<GitCodeSearchResult[]> {
        return [];
    }

    isCodeSearchSupported(): boolean {
        return true;
    }

    async searchLineByKeyword(keyword: string, filePath: string, ref: string): Promise<GitCodeSearchResult[]> {
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

    async fetchDirectoryTree(_filePath: string, _ref: string, _recursive?: boolean): Promise<GitTree[]> {
        return this.input.tree ?? [];
    }

    async fetchFileContent(filePath: string, _ref?: string): Promise<string> {
        return this.input.files?.[filePath] ?? `// file not found: ${filePath}`;
    }

    async fetchRepositoryList(): Promise<GitRepositoryListItem[]> {
        return [];
    }

    async fetchPullRequestVersion(_prIid: number): Promise<GitPullRequestVersion> {
        return this.input.version ?? defaultVersion;
    }

    async createPullRequestComment(_prIid: number, body: string): Promise<GitComment> {
        this.posted.push({ type: "comment", body });
        return {
            id: Date.now(),
            body,
            author: "test_bot",
            createdAt: new Date().toISOString(),
        };
    }

    async createCommentToSingleLine(_prIid: number, body: string, _position: GitDiffSingleLine): Promise<GitComment> {
        this.posted.push({ type: "inline", body });
        return {
            id: Date.now(),
            body,
            author: "test_bot",
            createdAt: new Date().toISOString(),
        };
    }

    async createCommentToMultiLine(_prIid: number, body: string, _position: GitDiffMultiLine): Promise<GitComment> {
        this.posted.push({ type: "inline", body });
        return {
            id: Date.now(),
            body,
            author: this.input.currentUser?.username ?? "test_bot",
            createdAt: new Date().toISOString(),
        };
    }

    async approvePullRequest(_prIid: number): Promise<void> {
        this.posted.push({ type: "approve", body: "" });
    }

    async unapprovePullRequest(_prIid: number): Promise<void> {
        this.posted.push({ type: "unapprove", body: "" });
    }

    async assignPullRequestReviewer(_prIid: number): Promise<void> {
        // Webhook-only; no-op for demo
    }
}
