import type {
    GitComment,
    GitChangedFile,
    GitDiff,
    GitDiffMultiLine,
    GitDiffSingleLine,
    GitMergeRequest,
    GitMergeRequestVersion,
    GitProvider,
    GitTree,
    GitUser,
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

    async fetchDirectoryTree(_filePath: string, _ref: string, _recursive?: boolean): Promise<GitTree[]> {
        return this.input.tree ?? [];
    }

    async fetchFileContent(filePath: string, _ref?: string): Promise<string> {
        return this.input.files?.[filePath] ?? `// file not found: ${filePath}`;
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
