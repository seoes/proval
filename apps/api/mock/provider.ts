import type {
    GitComment,
    GitChangedFile,
    GitCodeSearchResult,
    GitDiff,
    GitDiffMultiLine,
    GitDiffSingleLine,
    GitIssue,
    GitMergeRequest,
    GitMergeRequestVersion,
    GitProvider,
    GitRelatedItem,
    GitRepository,
    GitTree,
    GitUser,
    GitRepositoryListItem,
} from "../src/provider/types.js";

export interface TestInput {
    detail: GitMergeRequest;
    diffs: GitDiff[];
    comments?: GitComment[];
    files?: Record<string, string>;
    tree?: GitTree[];
    version?: GitMergeRequestVersion;
    /** Returned by fetchMergeRequestReviewerList (default []) */
    reviewers?: string[];
    /** Returned by fetchCurrentUser (default test_bot) */
    currentUser?: GitUser;
}

const defaultVersion: GitMergeRequestVersion = {
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

    async fetchMergeRequestDetail(_mrIid: number): Promise<GitMergeRequest> {
        return this.input.detail;
    }

    async fetchChangedFileList(_mrIid: number): Promise<GitChangedFile[]> {
        return this.input.diffs.map(({ oldPath, newPath, newFile, renamedFile, deletedFile }) => ({
            oldPath,
            newPath,
            newFile,
            renamedFile,
            deletedFile,
        }));
    }

    async fetchFileDiff(_mrIid: number, filePath: string): Promise<GitDiff> {
        const diff = this.input.diffs.find((item) => item.newPath === filePath || item.oldPath === filePath);
        if (!diff) {
            throw new Error(`Changed file not found in merge request: ${filePath}`);
        }
        return diff;
    }

    async fetchMergeRequestCommentList(_mrIid: number): Promise<GitComment[]> {
        return this.input.comments ?? [];
    }

    async fetchMergeRequestReviewerList(_mrIid: number): Promise<string[]> {
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
        return this.createMergeRequestComment(issueIid, body);
    }

    async searchIssueList(_query: string): Promise<GitRelatedItem[]> {
        return [];
    }

    async searchMergeRequestList(_query: string): Promise<GitRelatedItem[]> {
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

    async fetchMergeRequestVersion(_mrIid: number): Promise<GitMergeRequestVersion> {
        return this.input.version ?? defaultVersion;
    }

    async createMergeRequestComment(_mrIid: number, body: string): Promise<GitComment> {
        this.posted.push({ type: "comment", body });
        return {
            id: Date.now(),
            body,
            author: "test_bot",
            createdAt: new Date().toISOString(),
        };
    }

    async createCommentToSingleLine(_mrIid: number, body: string, _position: GitDiffSingleLine): Promise<GitComment> {
        this.posted.push({ type: "inline", body });
        return {
            id: Date.now(),
            body,
            author: "test_bot",
            createdAt: new Date().toISOString(),
        };
    }

    async createCommentToMultiLine(_mrIid: number, body: string, _position: GitDiffMultiLine): Promise<GitComment> {
        this.posted.push({ type: "inline", body });
        return {
            id: Date.now(),
            body,
            author: this.input.currentUser?.username ?? "test_bot",
            createdAt: new Date().toISOString(),
        };
    }

    async approveMergeRequest(_mrIid: number): Promise<void> {
        this.posted.push({ type: "approve", body: "" });
    }

    async unapproveMergeRequest(_mrIid: number): Promise<void> {
        this.posted.push({ type: "unapprove", body: "" });
    }

    async assignMergeRequestReviewer(_mrIid: number): Promise<void> {
        // Webhook-only; no-op for demo
    }
}
