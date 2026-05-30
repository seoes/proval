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
    GitPullRequestState,
    GitPullRequestVersion,
    GitProvider,
    GitRelatedItem,
    GitRepository,
    GitTree,
    GitUser,
    GitRepositoryListItem,
} from "./types.js";

/** Forgejo `POST /pulls/{index}/reviews` `comments[]` item (CreatePullReviewComment). */
type ForgejoPullReviewCommentDraft = {
    path: string;
    body: string;
    old_position: number;
    new_position: number;
};

export class ForgejoProvider implements GitProvider {
    /** In-memory drafts for one MR review run; submitted by `createPullRequestComment` via bulk `POST /reviews`. */
    private reviewBuffer: ForgejoPullReviewCommentDraft[] = [];
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

    public async fetchChangedFileList(prIid: number): Promise<GitChangedFile[]> {
        const files = await this.requestJson<
            Array<{
                filename: string;
                previous_filename?: string;
                status: string;
            }>
        >(`/repos/${this.owner}/${this.repo}/pulls/${prIid}/files`);

        return files.map((file) => ({
            oldPath: file.previous_filename ?? file.filename,
            newPath: file.filename,
            newFile: file.status === "added",
            renamedFile: file.status === "renamed",
            deletedFile: file.status === "removed",
        }));
    }

    public async fetchFileDiff(prIid: number, filePath: string): Promise<GitDiff> {
        const files = await this.requestJson<
            Array<{
                filename: string;
                previous_filename?: string;
                status: string;
                patch?: string;
            }>
        >(`/repos/${this.owner}/${this.repo}/pulls/${prIid}/files`);

        const file = files.find((f) => f.filename === filePath || f.previous_filename === filePath);
        if (!file) {
            throw new Error(`Changed file not found in pull request: ${filePath}`);
        }

        return {
            oldPath: file.previous_filename ?? file.filename,
            newPath: file.filename,
            newFile: file.status === "added",
            renamedFile: file.status === "renamed",
            deletedFile: file.status === "removed",
            diff: file.patch ?? "",
        };
    }

    public async fetchPullRequestCommentList(prIid: number): Promise<GitComment[]> {
        const [issueCommentList, reviews] = await Promise.all([
            this.requestJson<
                Array<{
                    id: number;
                    body: string;
                    user: { login: string } | null;
                    created_at: string;
                }>
            >(`/repos/${this.owner}/${this.repo}/issues/${prIid}/comments`),
            this.requestJson<
                Array<{
                    id: number;
                }>
            >(`/repos/${this.owner}/${this.repo}/pulls/${prIid}/reviews`),
        ]);

        const reviewCommentLists = await Promise.all(
            reviews.map(async (review) => {
                try {
                    return await this.requestJson<
                        Array<{
                            id: number;
                            body: string;
                            user: { login: string } | null;
                            created_at: string;
                        }>
                    >(`/repos/${this.owner}/${this.repo}/pulls/${prIid}/reviews/${review.id}/comments`);
                } catch {
                    return [];
                }
            }),
        );

        const out: GitComment[] = [];

        for (const comment of issueCommentList) {
            out.push({
                id: comment.id,
                body: comment.body,
                author: comment.user?.login ?? "",
                createdAt: comment.created_at,
            });
        }

        for (const list of reviewCommentLists) {
            for (const comment of list) {
                out.push({
                    id: comment.id,
                    body: comment.body,
                    author: comment.user?.login ?? "",
                    createdAt: comment.created_at,
                });
            }
        }

        out.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        return out;
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

    public async fetchIssueCommentList(issueIid: number): Promise<GitComment[]> {
        const comments = await this.requestJson<
            Array<{
                id: number;
                body: string;
                user: { login: string } | null;
                created_at: string;
            }>
        >(`/repos/${this.owner}/${this.repo}/issues/${issueIid}/comments`);

        return comments.map((comment) => ({
            id: comment.id,
            body: comment.body,
            author: comment.user?.login ?? "",
            createdAt: comment.created_at,
        }));
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
        const reviews = await this.requestJson<
            Array<{
                id: number;
                state: string;
                user: { login: string };
            }>
        >(`/repos/${this.owner}/${this.repo}/pulls/${prIid}/reviews`);

        const currentUser = await this.fetchCurrentUser();
        const userReview = reviews.find((r) => r.user.login === currentUser.username && r.state === "APPROVED");

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
        const response = await this.requestJson<{
            content?: string;
            encoding?: string;
            type?: string;
        }>(`/repos/${this.owner}/${this.repo}/contents/${filePath}?ref=${encodeURIComponent(defaultBranch)}`);

        if (response.type === "dir") {
            throw new Error(`Expected file but got directory: ${filePath}`);
        }

        if (response.encoding === "base64" && response.content) {
            return Buffer.from(response.content, "base64").toString("utf-8");
        }

        return response.content ?? "";
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

    private mapSingleLineToDraft(position: GitDiffSingleLine, body: string): ForgejoPullReviewCommentDraft {
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

    private mapMultiLineToDraft(position: GitDiffMultiLine, body: string): ForgejoPullReviewCommentDraft {
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
            throw new Error(`Forgejo request failed: ${response.status} ${response.statusText} - ${errorText}`);
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
