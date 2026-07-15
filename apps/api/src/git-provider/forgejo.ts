import type {
    GitChangedFile,
    GitComment,
    GitCodeSearchResult,
    GitDiff,
    GitDiffMultiLine,
    GitDiffSingleLine,
    GitIssue,
    GitIssueState,
    GitPullRequest,
    GitPullRequestInlineReview,
    GitPullRequestState,
    GitPullRequestVersion,
    GitProvider,
    GitRelatedItem,
    GitRepository,
    GitTree,
    GitUser,
    GitRepositoryListItem,
    ListPaginationOptions,
} from "./types.js";
import {
    buildInlineReviewList,
    findInlineReviewById,
    resolveInlineReviewRootId,
    type InlineReviewComment,
} from "./inline-review.js";

/** Forgejo `POST /pulls/{index}/reviews` `comments[]` item (Gitea CreatePullReviewComment; maps to inline review). */
type ForgejoInlineReviewCommentDraft = {
    path: string;
    body: string;
    old_position: number;
    new_position: number;
};

export class ForgejoProvider implements GitProvider {
    /** In-memory drafts for one MR review run; submitted by `createPullRequestComment` via bulk `POST /reviews`. */
    private reviewBuffer: ForgejoInlineReviewCommentDraft[] = [];
    private reviewBufferPrIid: number | null = null;
    private reviewBufferCommitId: string | null = null;
    private reviewBufferSeq = 0;

    constructor(
        private readonly baseUrl: string,
        private readonly token: string,
        private readonly owner: string,
        private readonly repo: string,
        private readonly repositoryId = 0,
    ) {}

    public async fetchCurrentUser(): Promise<GitUser> {
        const user = await this.requestJson<{
            login: string;
        }>("/user");
        return { username: user.login };
    }

    public async fetchRepositoryDetail(): Promise<GitRepository> {
        const repository = await this.requestJson<{
            id: number;
            name: string;
            description: string | null;
            default_branch: string;
        }>(`/repos/${this.owner}/${this.repo}`);

        return {
            id: repository.id,
            name: repository.name,
            description: repository.description,
            defaultBranch: repository.default_branch ?? "main",
        };
    }

    public async fetchRepositoryPath(): Promise<string> {
        if (this.repositoryId > 0) {
            const repository = await this.requestJson<{ full_name: string }>(`/repositories/${this.repositoryId}`);
            const path = repository.full_name?.trim();
            if (!path) {
                throw new Error("Forgejo repository path is missing");
            }
            return path;
        }
        const repository = await this.requestJson<{ full_name: string }>(`/repos/${this.owner}/${this.repo}`);
        const path = repository.full_name?.trim();
        if (!path) {
            throw new Error("Forgejo repository path is missing");
        }
        return path;
    }

    public async downloadArchive(ref: string, destPath: string): Promise<void> {
        const url = new URL(
            `/api/v1/repos/${this.owner}/${this.repo}/archive/${encodeURIComponent(ref)}.tar.gz`,
            this.baseUrl,
        );
        const response = await fetch(url, {
            headers: { Authorization: `token ${this.token}` },
        });
        if (!response.ok) {
            const errorText = await response.text();
            this.throwRequestError(response, errorText);
        }
        await Bun.write(destPath, response);
    }

    public async fetchPullRequestDetail(prIid: number): Promise<GitPullRequest> {
        const pr = await this.requestJson<{
            title: string;
            body: string | null;
            head: { ref: string };
            base: { ref: string };
            user: { login: string } | null;
            state: string;
            merged: boolean;
        }>(`/repos/${this.owner}/${this.repo}/pulls/${prIid}`);

        return {
            title: pr.title,
            description: pr.body,
            sourceBranch: pr.head.ref,
            targetBranch: pr.base.ref,
            author: pr.user?.login ?? "",
            state: this.mapPRState(pr.state, pr.merged),
        };
    }

    public async fetchPullRequestDiffList(prIid: number): Promise<GitDiff[]> {
        const path = `/repos/${this.owner}/${this.repo}/pulls/${prIid}/files`;
        const all: GitDiff[] = [];
        const limit = 50;
        for (let page = 1; ; page++) {
            const files = await this.requestJsonPaginated<
                Array<{
                    filename: string;
                    previous_filename?: string;
                    status: string;
                    patch?: string;
                }>
            >(path, page, limit);
            for (const file of files) {
                all.push({
                    oldPath: file.previous_filename ?? file.filename,
                    newPath: file.filename,
                    newFile: file.status === "added",
                    renamedFile: file.status === "renamed",
                    deletedFile: file.status === "removed",
                    diff: file.patch ?? "",
                });
            }
            if (files.length < limit) {
                break;
            }
        }
        return all;
    }

    public async fetchChangedFileList(prIid: number): Promise<GitChangedFile[]> {
        const diffs = await this.fetchPullRequestDiffList(prIid);
        return diffs.map(({ oldPath, newPath, newFile, renamedFile, deletedFile }) => ({
            oldPath,
            newPath,
            newFile,
            renamedFile,
            deletedFile,
        }));
    }

    public async fetchFileDiff(prIid: number, filePath: string): Promise<GitDiff> {
        const files = await this.fetchPullRequestDiffList(prIid);
        const file = files.find((f) => f.newPath === filePath || f.oldPath === filePath);
        if (!file) {
            throw new Error(`Changed file not found in pull request: ${filePath}`);
        }
        return file;
    }

    public async fetchPullRequestCommentList(
        prIid: number,
        options?: ListPaginationOptions,
    ): Promise<GitComment[]> {
        const path = `/repos/${this.owner}/${this.repo}/issues/${prIid}/comments`;
        if (options) {
            const data = await this.requestJsonPaginated<
                Array<{
                    id: number;
                    body: string;
                    user: { login: string } | null;
                    created_at: string;
                }>
            >(path, options.page, options.limit);
            return this.mapIssueCommentList(data);
        }
        return this.fetchIssueCommentListFromPath(path);
    }

    public async fetchPullRequestReviewerList(prIid: number): Promise<string[]> {
        const pr = await this.requestJson<{
            requested_reviewers?: Array<{ login: string }> | null;
        }>(`/repos/${this.owner}/${this.repo}/pulls/${prIid}`);

        return (pr.requested_reviewers ?? []).map((r) => r.login);
    }

    public async fetchPullRequestVersion(prIid: number): Promise<GitPullRequestVersion> {
        const pr = await this.requestJson<{
            head: { sha: string };
            base: { sha: string };
            merge_base?: string;
        }>(`/repos/${this.owner}/${this.repo}/pulls/${prIid}`);

        return {
            headSha: pr.head.sha,
            baseSha: pr.base.sha,
            startSha: pr.merge_base ?? pr.base.sha,
        };
    }

    public async fetchIssueDetail(issueIid: number): Promise<GitIssue> {
        const issue = await this.requestJson<{
            title: string;
            body: string | null;
            state: string;
            user: { login: string } | null;
            labels?: Array<{ name: string } | string>;
            is_locked?: boolean;
        }>(`/repos/${this.owner}/${this.repo}/issues/${issueIid}`);

        return {
            title: issue.title,
            description: issue.body,
            author: issue.user?.login ?? "",
            state: this.mapIssueState(issue.state, issue.is_locked ?? false),
            labels: (issue.labels ?? []).map((label) => (typeof label === "string" ? label : label.name)),
        };
    }

    public async fetchIssueComment(issueIid: number, commentId: number): Promise<GitComment> {
        return this.fetchPullRequestComment(issueIid, commentId);
    }

    public async fetchIssueCommentList(
        issueIid: number,
        options?: ListPaginationOptions,
    ): Promise<GitComment[]> {
        const path = `/repos/${this.owner}/${this.repo}/issues/${issueIid}/comments`;
        if (options) {
            const data = await this.requestJsonPaginated<
                Array<{
                    id: number;
                    body: string;
                    user: { login: string } | null;
                    created_at: string;
                }>
            >(path, options.page, options.limit);
            return this.mapIssueCommentList(data);
        }
        return this.fetchIssueCommentListFromPath(path);
    }

    public async createIssueComment(issueIid: number, body: string): Promise<GitComment> {
        const comment = await this.requestJson<{
            id: number;
            body: string;
            user: { login: string } | null;
            created_at: string;
        }>(`/repos/${this.owner}/${this.repo}/issues/${issueIid}/comments`, {
            method: "POST",
            body: JSON.stringify({ body }),
        });

        return {
            id: comment.id,
            body: comment.body,
            author: comment.user?.login ?? "",
            createdAt: comment.created_at,
        };
    }

    public async createPullRequestComment(prIid: number, body: string): Promise<GitComment> {
        await this.flushReviewBuffer(prIid);
        return this.createIssueComment(prIid, body);
    }

    public async fetchPullRequestComment(prIid: number, commentId: number): Promise<GitComment> {
        const comment = await this.requestJson<{
            id: number;
            body: string;
            user: { login: string } | null;
            created_at: string;
        }>(`/repos/${this.owner}/${this.repo}/issues/comments/${commentId}`);
        return {
            id: comment.id,
            body: comment.body,
            author: comment.user?.login ?? "",
            createdAt: comment.created_at,
        };
    }

    public async fetchPullRequestInlineReviewComment(prIid: number, commentId: number): Promise<GitComment> {
        const comment = await this.requestJson<{
            id: number;
            body: string;
            user: { login: string } | null;
            created_at: string;
        }>(`/repos/${this.owner}/${this.repo}/pulls/comments/${commentId}`);
        return {
            id: comment.id,
            body: comment.body,
            author: comment.user?.login ?? "",
            createdAt: comment.created_at,
        };
    }

    public async fetchPullRequestInlineReviewList(
        prIid: number,
        options?: ListPaginationOptions,
    ): Promise<GitPullRequestInlineReview[]> {
        const inlineReviewList = buildInlineReviewList(await this.fetchPullRequestInlineReviewCommentList(prIid));
        if (!options) {
            return inlineReviewList;
        }
        const start = (options.page - 1) * options.limit;
        return inlineReviewList.slice(start, start + options.limit);
    }

    public async fetchPullRequestInlineReview(
        prIid: number,
        inlineReviewId: string,
    ): Promise<GitPullRequestInlineReview> {
        const inlineReviewList = await this.fetchPullRequestInlineReviewList(prIid);
        const review = findInlineReviewById(inlineReviewList, inlineReviewId);
        if (!review) {
            throw new Error(`Inline review not found: ${inlineReviewId}`);
        }
        return review;
    }

    public async replyToPullRequestInlineReview(
        prIid: number,
        inlineReviewId: string,
        body: string,
    ): Promise<GitComment> {
        await this.flushReviewBuffer(prIid);

        const inlineReviewCommentList = await this.fetchPullRequestInlineReviewCommentList(prIid);
        const rootId = resolveInlineReviewRootId(Number(inlineReviewId), inlineReviewCommentList);

        const comment = await this.requestJson<{
            id: number;
            body: string;
            user: { login: string } | null;
            created_at: string;
        }>(`/repos/${this.owner}/${this.repo}/pulls/${prIid}/comments/${rootId}/replies`, {
            method: "POST",
            body: JSON.stringify({ body }),
        });

        return {
            id: comment.id,
            body: comment.body,
            author: comment.user?.login ?? "",
            createdAt: comment.created_at,
        };
    }

    public async createCommentToSingleLine(
        prIid: number,
        body: string,
        position: GitDiffSingleLine,
    ): Promise<GitComment> {
        this.resetReviewBufferIfPrMismatch(prIid);
        if (!this.reviewBufferCommitId) {
            this.reviewBufferCommitId = position.headSha;
        }

        const draft = this.mapSingleLineToDraft(position, body);
        this.reviewBuffer.push(draft);
        this.reviewBufferSeq += 1;

        return {
            id: -this.reviewBufferSeq,
            body,
            author: "",
            createdAt: new Date().toISOString(),
        };
    }

    public async createCommentToMultiLine(
        prIid: number,
        body: string,
        position: GitDiffMultiLine,
    ): Promise<GitComment> {
        this.resetReviewBufferIfPrMismatch(prIid);
        if (this.reviewBufferCommitId !== null) {
            this.reviewBufferCommitId = position.headSha;
        }

        const draft = this.mapMultiLineToDraft(position, body);
        this.reviewBuffer.push(draft);
        this.reviewBufferSeq += 1;

        return {
            id: -this.reviewBufferSeq,
            body,
            author: "",
            createdAt: new Date().toISOString(),
        };
    }

    public async approvePullRequest(prIid: number): Promise<void> {
        await this.requestJson(`/repos/${this.owner}/${this.repo}/pulls/${prIid}/reviews`, {
            method: "POST",
            body: JSON.stringify({
                body: "",
                event: "APPROVE",
            }),
        });
    }

    public async unapprovePullRequest(prIid: number): Promise<void> {
        // Get existing reviews
        const pullReviewList = await this.requestJson<
            Array<{
                id: number;
                state: string;
                user: { login: string };
            }>
        >(`/repos/${this.owner}/${this.repo}/pulls/${prIid}/reviews`);

        const currentUser = await this.fetchCurrentUser();
        const userReview = pullReviewList.find((r) => r.user.login === currentUser.username && r.state === "APPROVED");

        if (userReview) {
            // Dismiss the review
            await this.requestJson(
                `/repos/${this.owner}/${this.repo}/pulls/${prIid}/reviews/${userReview.id}/dismissals`,
                {
                    method: "POST",
                    body: JSON.stringify({
                        message: "Dismissed by bot",
                    }),
                },
            );
        }
    }

    public async assignPullRequestReviewer(prIid: number): Promise<void> {
        const user = await this.fetchCurrentUser();

        await this.requestJson(`/repos/${this.owner}/${this.repo}/pulls/${prIid}/requested_reviewers`, {
            method: "POST",
            body: JSON.stringify({
                reviewers: [user.username],
            }),
        });
    }

    public async fetchRepositoryList(): Promise<GitRepositoryListItem[]> {
        const repos = await this.requestJson<
            Array<{
                id: number;
                name: string;
                full_name: string;
                description: string | null;
                default_branch: string;
            }>
        >("/user/repos");

        return repos.map((repo) => ({
            id: repo.id,
            name: repo.name,
            fullName: repo.full_name,
            description: repo.description,
            defaultBranch: repo.default_branch ?? "main",
        }));
    }

    public async searchIssueList(query: string): Promise<GitRelatedItem[]> {
        // Forgejo/Gitea search API is limited; use issues endpoint with search
        const issues = await this.requestJson<
            Array<{
                number: number;
                title: string;
                body: string | null;
                state: string;
                user: { login: string } | null;
                html_url?: string;
            }>
        >(`/repos/${this.owner}/${this.repo}/issues?state=all&search=${encodeURIComponent(query)}`);

        return issues
            .filter((issue) => !issue.html_url?.includes("/pulls/")) // Filter out PRs
            .map((issue) => ({
                number: issue.number,
                title: issue.title,
                description: issue.body,
                state: issue.state === "closed" ? "closed" : "opened",
                author: issue.user?.login ?? "",
                url: issue.html_url ?? "",
            }));
    }

    public async searchPullRequestList(query: string): Promise<GitRelatedItem[]> {
        const prs = await this.requestJson<
            Array<{
                number: number;
                title: string;
                body: string | null;
                state: string;
                user: { login: string } | null;
                html_url?: string;
                merged?: boolean;
            }>
        >(`/repos/${this.owner}/${this.repo}/pulls?state=all&search=${encodeURIComponent(query)}`);

        return prs.map((pr) => ({
            number: pr.number,
            title: pr.title,
            description: pr.body,
            state: pr.merged ? "merged" : pr.state === "closed" ? "closed" : "opened",
            author: pr.user?.login ?? "",
            url: pr.html_url ?? "",
        }));
    }

    public isCodeSearchSupported(): boolean {
        return false;
    }

    public async searchCodeList(_query: string, _ref: string): Promise<GitCodeSearchResult[]> {
        return [];
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

    public async fetchDirectoryTree(filePath: string, ref: string, _recursive?: boolean): Promise<GitTree[]> {
        const contents = await this.requestJson<
            | Array<{
                  name: string;
                  path: string;
                  type: string;
              }>
            | {
                  name: string;
                  path: string;
                  type: string;
              }
        >(`/repos/${this.owner}/${this.repo}/contents/${filePath}?ref=${encodeURIComponent(ref)}`);

        if (!Array.isArray(contents)) {
            return [];
        }

        return contents.map((item) => ({
            name: item.name,
            path: item.path,
            type: item.type === "dir" ? "directory" : "file",
        }));
    }

    public async fetchFileContent(filePath: string, ref?: string): Promise<string> {
        const defaultBranch = ref ?? (await this.fetchRepositoryDetail()).defaultBranch;
        try {
            const response = await this.requestJson<{
                content?: string;
                encoding?: string;
                type?: string;
            }>(`/repos/${this.owner}/${this.repo}/contents/${filePath}?ref=${encodeURIComponent(defaultBranch)}`);

            if (response.type === "dir") {
                throw new Error(`Path is a directory, not a file: ${filePath}`);
            }

            if (response.encoding === "base64" && response.content) {
                return Buffer.from(response.content, "base64").toString("utf-8");
            }

            return response.content ?? "";
        } catch (error) {
            if (
                typeof error === "object" &&
                error !== null &&
                (error as { status?: number }).status === 404
            ) {
                throw new Error(`File not found: ${filePath}`);
            }
            throw error;
        }
    }

    private throwRequestError(response: Response, errorText: string): never {
        const error = new Error(
            `Forgejo request failed: ${response.status} ${response.statusText} - ${errorText}`,
        );
        (error as Error & { status: number }).status = response.status;
        throw error;
    }

    private resetReviewBufferIfPrMismatch(prIid: number): void {
        if (this.reviewBufferPrIid !== null && this.reviewBufferPrIid !== prIid) {
            this.reviewBuffer = [];
            this.reviewBufferCommitId = null;
            this.reviewBufferSeq = 0;
        }
        this.reviewBufferPrIid = prIid;
    }

    private clearReviewBuffer(): void {
        this.reviewBuffer = [];
        this.reviewBufferPrIid = null;
        this.reviewBufferCommitId = null;
    }

    private mapSingleLineToDraft(position: GitDiffSingleLine, body: string): ForgejoInlineReviewCommentDraft {
        const newPos = position.newLine ?? 0;
        const oldPos = position.oldLine ?? 0;
        if (newPos === 0 && oldPos === 0) {
            throw new Error("Forgejo inline comment requires newLine or oldLine in position");
        }
        return {
            path: position.newPath,
            body,
            old_position: oldPos,
            new_position: newPos,
        };
    }

    private mapMultiLineToDraft(position: GitDiffMultiLine, body: string): ForgejoInlineReviewCommentDraft {
        let newPos = 0;
        let oldPos = 0;
        if (position.end.type === "new") {
            newPos = position.end.newLine ?? 0;
        } else {
            oldPos = position.end.oldLine ?? 0;
        }

        let text = body;
        if (position.start.type === "new" && position.end.type === "new") {
            const a = position.start.newLine;
            const b = position.end.newLine;
            if (a !== undefined && b !== undefined && a !== b) {
                text = `*(lines ${a}-${b})*\n\n${body}`;
            }
        } else if (position.start.type === "old" && position.end.type === "old") {
            const a = position.start.oldLine;
            const b = position.end.oldLine;
            if (a !== undefined && b !== undefined && a !== b) {
                text = `*(lines ${a}-${b})*\n\n${body}`;
            }
        }

        if (newPos === 0 && oldPos === 0) {
            throw new Error("Forgejo multiline comment requires a resolvable end line on old or new side");
        }

        return {
            path: position.newPath,
            body: text,
            old_position: oldPos,
            new_position: newPos,
        };
    }

    private async flushReviewBuffer(prIid: number): Promise<void> {
        if (this.reviewBuffer.length === 0) {
            return;
        }
        if (this.reviewBufferPrIid !== null && this.reviewBufferPrIid !== prIid) {
            this.clearReviewBuffer();
            this.reviewBufferSeq = 0;
            return;
        }

        const commitId = this.reviewBufferCommitId ?? (await this.fetchPullRequestVersion(prIid)).headSha;

        await this.requestJson(`/repos/${this.owner}/${this.repo}/pulls/${prIid}/reviews`, {
            method: "POST",
            body: JSON.stringify({
                event: "COMMENT",
                body: "",
                commit_id: commitId,
                comments: this.reviewBuffer.map((c) => ({
                    path: c.path,
                    body: c.body,
                    old_position: c.old_position,
                    new_position: c.new_position,
                })),
            }),
        });

        this.clearReviewBuffer();
        this.reviewBufferSeq = 0;
    }

    private mapIssueCommentList(
        apiCommentList: Array<{
            id: number;
            body: string;
            user: { login: string } | null;
            created_at: string;
        }>,
    ): GitComment[] {
        const commentList = apiCommentList.map((comment) => ({
            id: comment.id,
            body: comment.body,
            author: comment.user?.login ?? "",
            createdAt: comment.created_at,
        }));
        commentList.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        return commentList;
    }

    private async fetchIssueCommentListFromPath(path: string): Promise<GitComment[]> {
        const commentList: GitComment[] = [];
        for (let page = 1; ; page++) {
            const data = await this.requestJsonPaginated<
                Array<{
                    id: number;
                    body: string;
                    user: { login: string } | null;
                    created_at: string;
                }>
            >(path, page, 50);
            commentList.push(...this.mapIssueCommentList(data));
            if (data.length < 50) {
                break;
            }
        }
        return commentList;
    }

    private async fetchPullRequestInlineReviewCommentList(prIid: number): Promise<InlineReviewComment[]> {
        const path = `/repos/${this.owner}/${this.repo}/pulls/${prIid}/comments`;
        const inlineReviewCommentList: InlineReviewComment[] = [];
        for (let page = 1; ; page++) {
            const data = await this.requestJsonPaginated<
                Array<{
                    id: number;
                    body: string;
                    user: { login: string } | null;
                    created_at: string;
                    in_reply_to?: number | null;
                    path?: string | null;
                    line?: number | null;
                    original_line?: number | null;
                    side?: string | null;
                }>
            >(path, page, 50);
            inlineReviewCommentList.push(
                ...data.map((comment) => ({
                    id: comment.id,
                    body: comment.body,
                    author: comment.user?.login ?? "",
                    createdAt: comment.created_at,
                    inReplyToId: comment.in_reply_to ?? null,
                    path: comment.path ?? null,
                    line: comment.line,
                    originalLine: comment.original_line,
                    side: comment.side,
                })),
            );
            if (data.length < 50) {
                break;
            }
        }
        return inlineReviewCommentList;
    }

    private async requestJsonPaginated<T>(path: string, page: number, limit: number): Promise<T> {
        const separator = path.includes("?") ? "&" : "?";
        const url = new URL(`/api/v1${path}${separator}page=${page}&limit=${limit}`, this.baseUrl);
        const response = await fetch(url, {
            headers: {
                "Content-Type": "application/json",
                Authorization: `token ${this.token}`,
            },
        });

        if (!response.ok) {
            const errorText = await response.text();
            this.throwRequestError(response, errorText);
        }

        return (await response.json()) as T;
    }

    private async requestJson<T>(path: string, init?: RequestInit): Promise<T> {
        const url = new URL(`/api/v1${path}`, this.baseUrl);
        const response = await fetch(url, {
            ...init,
            headers: {
                "Content-Type": "application/json",
                Authorization: `token ${this.token}`,
                ...(init?.headers ?? {}),
            },
        });

        if (!response.ok) {
            const errorText = await response.text();
            this.throwRequestError(response, errorText);
        }

        // Handle empty responses (e.g., for void returns)
        const contentLength = response.headers.get("content-length");
        if (contentLength === "0" || response.status === 204) {
            return {} as T;
        }

        return (await response.json()) as T;
    }

    private mapPRState(state: string, merged: boolean): GitPullRequestState {
        if (merged) return "merged";
        if (state === "open") return "opened";
        return "closed";
    }

    private mapIssueState(state: string, locked: boolean): GitIssueState {
        if (locked) return "locked";
        if (state === "closed") return "closed";
        return "opened";
    }
}
