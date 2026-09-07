import type {
    GitComment,
    GitCodeSearchResult,
    GitDiffMultiLine,
    GitDiffSingleLine,
    GitIssue,
    GitPullRequest,
    GitPullRequestInlineReview,
    GitPullRequestVersion,
    GitProvider,
    GitRelatedItem,
    GitRepository,
    GitTree,
    GitUser,
    GitUserPermissionIdentity,
    GitRepositoryListItem,
    ListPaginationOptions,
} from "./types.js";
import { log } from "../util/log.js";
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
    /** In-memory drafts for one PR review run. `submitPullRequestReview` posts them as bulk `POST /reviews`. */
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

    public async fetchUserPermission(identity: GitUserPermissionIdentity): Promise<number> {
        if (!("login" in identity) || !identity.login) {
            throw new Error("Forgejo fetchUserPermission requires login");
        }

        try {
            const result = await this.requestJson<{
                permission?: string;
                role_name?: string;
            }>(`/repos/${this.owner}/${this.repo}/collaborators/${identity.login}/permission`);
            if (result.role_name === "owner") return 5;
            return forgejoPermissionToLevel(result.permission ?? "none");
        } catch (error) {
            const status = (error as { status?: number }).status;
            if (status === 404) return 0;
            throw error;
        }
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

    public async fetchGitRepositoryUrl(): Promise<string> {
        const path = await this.fetchRepositoryPath();
        const host = this.baseUrl.replace(/\/$/, "");
        return `${host}/${path}.git`;
    }

    public async fetchGitRepositoryAuthHeader(): Promise<string> {
        return `Authorization: token ${this.token}`;
    }

    public getPullRequestHeadFetchRef(prIid: number): string {
        return `refs/pull/${prIid}/head`;
    }

    public getBranchFetchRef(branch: string): string {
        return `refs/heads/${branch}`;
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
            state: pr.merged ? "merged" : pr.state === "open" ? "opened" : "closed",
        };
    }

    public async fetchPullRequestChangedFileCount(prIid: number): Promise<number> {
        const pr = await this.requestJson<{ changed_files?: number }>(
            `/repos/${this.owner}/${this.repo}/pulls/${prIid}`,
        );
        return pr.changed_files ?? 0;
    }

    public async fetchPullRequestCommentList(prIid: number, options?: ListPaginationOptions): Promise<GitComment[]> {
        const path = `/repos/${this.owner}/${this.repo}/issues/${prIid}/comments`;
        const commentList: GitComment[] = [];
        if (options) {
            const data = await this.requestJson<
                Array<{
                    id: number;
                    body: string;
                    user: { login: string } | null;
                    created_at: string;
                }>
            >(`${path}?page=${options.page}&limit=${options.limit}`);
            commentList.push(
                ...data.map((comment) => ({
                    id: comment.id,
                    body: comment.body,
                    author: comment.user?.login ?? "",
                    createdAt: comment.created_at,
                })),
            );
        } else {
            for (let page = 1; ; page++) {
                const data = await this.requestJson<
                    Array<{
                        id: number;
                        body: string;
                        user: { login: string } | null;
                        created_at: string;
                    }>
                >(`${path}?page=${page}&limit=50`);
                commentList.push(
                    ...data.map((comment) => ({
                        id: comment.id,
                        body: comment.body,
                        author: comment.user?.login ?? "",
                        createdAt: comment.created_at,
                    })),
                );
                if (data.length < 50) {
                    break;
                }
            }
        }
        commentList.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        return commentList;
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
            state: issue.is_locked ? "locked" : issue.state === "closed" ? "closed" : "opened",
            labels: (issue.labels ?? []).map((label) => (typeof label === "string" ? label : label.name)),
        };
    }

    public async fetchIssueComment(issueIid: number, commentId: number): Promise<GitComment> {
        return this.fetchPullRequestComment(issueIid, commentId);
    }

    public async fetchIssueCommentList(issueIid: number, options?: ListPaginationOptions): Promise<GitComment[]> {
        const path = `/repos/${this.owner}/${this.repo}/issues/${issueIid}/comments`;
        const commentList: GitComment[] = [];
        if (options) {
            const data = await this.requestJson<
                Array<{
                    id: number;
                    body: string;
                    user: { login: string } | null;
                    created_at: string;
                }>
            >(`${path}?page=${options.page}&limit=${options.limit}`);
            commentList.push(
                ...data.map((comment) => ({
                    id: comment.id,
                    body: comment.body,
                    author: comment.user?.login ?? "",
                    createdAt: comment.created_at,
                })),
            );
        } else {
            for (let page = 1; ; page++) {
                const data = await this.requestJson<
                    Array<{
                        id: number;
                        body: string;
                        user: { login: string } | null;
                        created_at: string;
                    }>
                >(`${path}?page=${page}&limit=50`);
                commentList.push(
                    ...data.map((comment) => ({
                        id: comment.id,
                        body: comment.body,
                        author: comment.user?.login ?? "",
                        createdAt: comment.created_at,
                    })),
                );
                if (data.length < 50) {
                    break;
                }
            }
        }
        commentList.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        return commentList;
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
        await this.submitPullRequestReview(prIid);
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
        const comment = (await this.fetchPullRequestInlineReviewCommentList(prIid)).find(
            (item) => item.id === commentId,
        );
        if (!comment) {
            throw new Error(`Forgejo inline review comment not found: ${commentId}`);
        }
        return {
            id: comment.id,
            body: comment.body,
            author: comment.author,
            createdAt: comment.createdAt,
        };
    }

    public async resolvePrReplyTarget(
        prIid: number,
        commentId: number,
        match?: { body?: string; author?: string; createdAt?: string },
    ): Promise<{ commentId: number; inlineReviewId: string | null }> {
        const commentList = await this.fetchPullRequestInlineReviewCommentList(prIid);
        const byId = commentList.find((comment) => comment.id === commentId);
        if (byId) {
            return { commentId: byId.id, inlineReviewId: String(byId.inReplyToId ?? byId.id) };
        }
        if (!match || (match.body === undefined && match.author === undefined)) {
            return { commentId, inlineReviewId: null };
        }
        const picked = commentList
            .filter((comment) => {
                if (match.body !== undefined && comment.body !== match.body) return false;
                if (match.author !== undefined && comment.author !== match.author) return false;
                if (match.createdAt !== undefined && comment.createdAt !== match.createdAt) return false;
                return true;
            })
            .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
            .at(-1);
        if (!picked) {
            return { commentId, inlineReviewId: null };
        }
        return { commentId: picked.id, inlineReviewId: String(picked.inReplyToId ?? picked.id) };
    }

    public async resolveReviewedPrReplyTarget(
        prIid: number,
        review: {
            comments?: Array<{
                id: number;
                body?: string;
                in_reply_to?: number | null;
                user?: { login?: string };
            }>;
            content?: string;
            body?: string;
        },
        senderLogin?: string,
    ): Promise<{ commentId: number; inlineReviewId: string | null } | null> {
        const trigger = (review.comments ?? []).at(-1);
        if (trigger) {
            const fromList = await this.resolvePrReplyTarget(prIid, trigger.id, {
                body: trigger.body,
                author: trigger.user?.login,
            });
            if (fromList.inlineReviewId) {
                return fromList;
            }
            return { commentId: trigger.id, inlineReviewId: String(trigger.in_reply_to ?? trigger.id) };
        }

        const last = (await this.fetchPullRequestInlineReviewCommentList(prIid)).at(-1);
        if (last) {
            return { commentId: last.id, inlineReviewId: String(last.inReplyToId ?? last.id) };
        }

        const reviewBody = review.content ?? review.body ?? "";
        if (!reviewBody) {
            return null;
        }
        const picked = (await this.fetchPullRequestCommentList(prIid))
            .filter((comment) => comment.body === reviewBody && (!senderLogin || comment.author === senderLogin))
            .at(-1);
        return picked ? { commentId: picked.id, inlineReviewId: null } : null;
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
        await this.submitPullRequestReview(prIid);

        const inlineReviewCommentList = await this.fetchPullRequestInlineReviewCommentList(prIid);
        const rootId = resolveInlineReviewRootId(Number(inlineReviewId), inlineReviewCommentList);
        const root = inlineReviewCommentList.find((comment) => comment.id === rootId);
        if (!root) {
            throw new Error(`Forgejo inline review comment not found: ${rootId}`);
        }
        const replyPath = `/repos/${this.owner}/${this.repo}/pulls/${prIid}/reviews/${root.reviewId}/comments`;

        const comment = await this.requestJson<{
            id: number;
            body: string;
            user: { login: string } | null;
            created_at: string;
        }>(replyPath, {
            method: "POST",
            body: JSON.stringify({
                body,
                path: root.path,
                old_position: root.originalLine ?? 0,
                new_position: root.line ?? 0,
            }),
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
        if (this.reviewBufferPrIid !== null && this.reviewBufferPrIid !== prIid) {
            this.reviewBuffer = [];
            this.reviewBufferCommitId = null;
            this.reviewBufferSeq = 0;
        }
        this.reviewBufferPrIid = prIid;
        if (!this.reviewBufferCommitId) {
            this.reviewBufferCommitId = position.headSha;
        }

        const newPos = position.newLine ?? 0;
        const oldPos = position.oldLine ?? 0;
        if (newPos === 0 && oldPos === 0) {
            throw new Error("Forgejo inline comment requires newLine or oldLine in position");
        }
        this.reviewBuffer.push({
            path: position.newPath,
            body,
            old_position: oldPos,
            new_position: newPos,
        });
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
        if (this.reviewBufferPrIid !== null && this.reviewBufferPrIid !== prIid) {
            this.reviewBuffer = [];
            this.reviewBufferCommitId = null;
            this.reviewBufferSeq = 0;
        }
        this.reviewBufferPrIid = prIid;
        if (this.reviewBufferCommitId !== null) {
            this.reviewBufferCommitId = position.headSha;
        }

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

        this.reviewBuffer.push({
            path: position.newPath,
            body: text,
            old_position: oldPos,
            new_position: newPos,
        });
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
        type ForgejoRepo = {
            id: number;
            name: string;
            full_name: string;
            description: string | null;
            default_branch: string;
        };

        const repoList: ForgejoRepo[] = [];
        for (let page = 1; ; page++) {
            const pageList = await this.requestJson<ForgejoRepo[]>(`/user/repos?page=${page}&limit=50`);
            if (pageList.length === 0) {
                break;
            }
            repoList.push(...pageList);
        }

        repoList.sort((a, b) => a.full_name.localeCompare(b.full_name));

        return repoList.map((repo) => ({
            id: repo.id,
            name: repo.name,
            fullName: repo.full_name,
            description: repo.description,
            defaultBranch: repo.default_branch ?? "main",
        }));
    }

    public async searchIssueList(query: string): Promise<GitRelatedItem[]> {
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
            .filter((issue) => !issue.html_url?.includes("/pulls/"))
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
            if (typeof error === "object" && error !== null && (error as { status?: number }).status === 404) {
                throw new Error(`File not found: ${filePath}`);
            }
            throw error;
        }
    }

    private async fetchPullRequestInlineReviewCommentList(prIid: number): Promise<InlineReviewComment[]> {
        const reviewPath = `/repos/${this.owner}/${this.repo}/pulls/${prIid}/reviews`;
        const reviewList: Array<{
            id: number;
            comments_count?: number;
        }> = [];
        for (let page = 1; ; page++) {
            const data = await this.requestJson<typeof reviewList>(`${reviewPath}?page=${page}&limit=50`);
            reviewList.push(...data);
            if (data.length < 50) {
                break;
            }
        }

        const inlineReviewCommentList: InlineReviewComment[] = [];
        for (const review of reviewList) {
            if (review.comments_count === 0) {
                continue;
            }
            const path = `/repos/${this.owner}/${this.repo}/pulls/${prIid}/reviews/${review.id}/comments`;
            try {
                const data = await this.requestJson<
                    Array<{
                        id: number;
                        body?: string;
                        content?: string;
                        user?: { login?: string } | null;
                        created_at?: string;
                        in_reply_to?: number | null;
                        in_reply_to_id?: number | null;
                        path?: string | null;
                        line?: number | null;
                        original_line?: number | null;
                        position?: number | null;
                        original_position?: number | null;
                        new_position?: number | null;
                        old_position?: number | null;
                        side?: string | null;
                        pull_request_review_id?: number | null;
                    }>
                >(path);
                inlineReviewCommentList.push(
                    ...(Array.isArray(data) ? data : []).map((raw) => {
                        const line = raw.line ?? raw.new_position ?? raw.position ?? null;
                        const originalLine = raw.original_line ?? raw.old_position ?? raw.original_position ?? null;
                        return {
                            id: raw.id,
                            body: raw.body ?? raw.content ?? "",
                            author: raw.user?.login ?? "",
                            createdAt: raw.created_at ?? "",
                            inReplyToId: raw.in_reply_to ?? raw.in_reply_to_id ?? null,
                            path: raw.path ?? null,
                            line,
                            originalLine,
                            side: raw.side ?? ((line ?? 0) > 0 ? "RIGHT" : (originalLine ?? 0) > 0 ? "LEFT" : null),
                            reviewId: raw.pull_request_review_id ?? review.id,
                        };
                    }),
                );
            } catch (error) {
                if ((error as { status?: number }).status === 404) {
                    continue;
                }
                throw error;
            }
        }
        return inlineReviewCommentList;
    }

    private async submitPullRequestReview(prIid: number): Promise<void> {
        if (this.reviewBuffer.length === 0) {
            return;
        }
        if (this.reviewBufferPrIid !== null && this.reviewBufferPrIid !== prIid) {
            this.reviewBuffer = [];
            this.reviewBufferPrIid = null;
            this.reviewBufferCommitId = null;
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

        this.reviewBuffer = [];
        this.reviewBufferPrIid = null;
        this.reviewBufferCommitId = null;
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
            await response.text();
            log(`request failed ${response.status} ${path}`, "Forgejo");
            const error = new Error(`Forgejo request failed ${response.status} ${path}`);
            (error as Error & { status: number }).status = response.status;
            throw error;
        }

        const contentLength = response.headers.get("content-length");
        if (contentLength === "0" || response.status === 204) {
            return {} as T;
        }

        return (await response.json()) as T;
    }
}

function forgejoPermissionToLevel(permission: string): number {
    const forgejoPermissionToLevelMap: Record<string, number> = {
        none: 0,
        read: 1,
        write: 3,
        admin: 4,
        owner: 5,
    };
    return forgejoPermissionToLevelMap[permission] ?? 0;
}
