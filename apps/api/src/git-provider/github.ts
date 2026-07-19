import { Octokit } from "@octokit/rest";
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

export class GitHubProvider implements GitProvider {
    private readonly octokit: Octokit;

    constructor(
        octokit: Octokit,
        private readonly owner: string,
        private readonly repo: string,
        private readonly botUsername: string,
    ) {
        this.octokit = octokit;
    }

    public async fetchCurrentUser(): Promise<GitUser> {
        return { username: this.botUsername };
    }

    public async fetchRepositoryDetail(): Promise<GitRepository> {
        const { data: repository } = await this.octokit.repos.get({
            owner: this.owner,
            repo: this.repo,
        });

        return {
            id: repository.id,
            name: repository.name,
            description: repository.description,
            defaultBranch: repository.default_branch,
        };
    }

    public async fetchRepositoryPath(): Promise<string> {
        const { data: repository } = await this.octokit.repos.get({
            owner: this.owner,
            repo: this.repo,
        });
        const path = repository.full_name?.trim();
        if (!path) {
            throw new Error("GitHub repository path is missing");
        }
        return path;
    }

    public async downloadArchive(ref: string, destPath: string): Promise<void> {
        const response = await this.octokit.repos.downloadTarballArchive({
            owner: this.owner,
            repo: this.repo,
            ref,
            request: { redirect: "follow" },
        });
        const data = response.data as ArrayBuffer | Uint8Array | unknown;
        if (data instanceof ArrayBuffer) {
            await Bun.write(destPath, data);
            return;
        }
        if (data instanceof Uint8Array) {
            await Bun.write(destPath, data);
            return;
        }
        // Octokit may return a stream-like / Response depending on version
        const anyData = data as { arrayBuffer?: () => Promise<ArrayBuffer> };
        if (typeof anyData?.arrayBuffer === "function") {
            await Bun.write(destPath, await anyData.arrayBuffer());
            return;
        }
        throw new Error("GitHub archive download returned unexpected payload type");
    }

    public async fetchPullRequestDetail(prNumber: number): Promise<GitPullRequest> {
        const { data: pr } = await this.octokit.pulls.get({
            owner: this.owner,
            repo: this.repo,
            pull_number: prNumber,
        });

        return {
            title: pr.title,
            description: pr.body,
            sourceBranch: pr.head.ref,
            targetBranch: pr.base.ref,
            author: pr.user?.login ?? "",
            state: this.mapPRState(pr.state, pr.merged),
        };
    }

    public async fetchPullRequestDiffList(prNumber: number): Promise<GitDiff[]> {
        const files = await this.octokit.paginate(this.octokit.pulls.listFiles, {
            owner: this.owner,
            repo: this.repo,
            pull_number: prNumber,
            per_page: 100,
        });

        return files.map((file) => ({
            oldPath: file.previous_filename ?? file.filename,
            newPath: file.filename,
            newFile: file.status === "added",
            renamedFile: file.status === "renamed",
            deletedFile: file.status === "removed",
            diff: file.patch ?? "",
        }));
    }

    public async fetchChangedFileList(prNumber: number): Promise<GitChangedFile[]> {
        const diffs = await this.fetchPullRequestDiffList(prNumber);
        return diffs.map(({ oldPath, newPath, newFile, renamedFile, deletedFile }) => ({
            oldPath,
            newPath,
            newFile,
            renamedFile,
            deletedFile,
        }));
    }

    public async fetchFileDiff(prNumber: number, filePath: string): Promise<GitDiff> {
        const files = await this.fetchPullRequestDiffList(prNumber);
        const file = files.find((f) => f.newPath === filePath || f.oldPath === filePath);
        if (!file) {
            throw new Error(`Changed file not found in pull request: ${filePath}`);
        }
        return file;
    }

    public async fetchPullRequestCommentList(prNumber: number, options?: ListPaginationOptions): Promise<GitComment[]> {
        const mapComment = (comment: {
            id: number;
            body?: string | null;
            user?: { login?: string } | null;
            created_at: string;
        }): GitComment => ({
            id: comment.id,
            body: comment.body ?? "",
            author: comment.user?.login ?? "",
            createdAt: comment.created_at,
        });

        if (options) {
            const { data } = await this.octokit.issues.listComments({
                owner: this.owner,
                repo: this.repo,
                issue_number: prNumber,
                page: options.page,
                per_page: options.limit,
            });
            const commentList = data.map(mapComment);
            commentList.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
            return commentList;
        }

        const commentList: GitComment[] = [];
        for (let page = 1; ; page++) {
            const response = await this.octokit.issues.listComments({
                owner: this.owner,
                repo: this.repo,
                issue_number: prNumber,
                page,
                per_page: 100,
            });
            commentList.push(...response.data.map(mapComment));
            if (!response.headers.link?.includes('rel="next"')) {
                break;
            }
        }
        commentList.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        return commentList;
    }

    public async fetchPullRequestComment(prNumber: number, commentId: number): Promise<GitComment> {
        const { data: comment } = await this.octokit.issues.getComment({
            owner: this.owner,
            repo: this.repo,
            comment_id: commentId,
        });
        return {
            id: comment.id,
            body: comment.body ?? "",
            author: comment.user?.login ?? "",
            createdAt: comment.created_at,
        };
    }

    public async fetchPullRequestInlineReviewComment(prNumber: number, commentId: number): Promise<GitComment> {
        const { data: comment } = await this.octokit.pulls.getReviewComment({
            owner: this.owner,
            repo: this.repo,
            comment_id: commentId,
        });
        return {
            id: comment.id,
            body: comment.body ?? "",
            author: comment.user?.login ?? "",
            createdAt: comment.created_at,
        };
    }

    public async fetchIssueComment(issueNumber: number, commentId: number): Promise<GitComment> {
        return this.fetchPullRequestComment(issueNumber, commentId);
    }

    public async fetchIssueDetail(issueNumber: number): Promise<GitIssue> {
        const { data: issue } = await this.octokit.issues.get({
            owner: this.owner,
            repo: this.repo,
            issue_number: issueNumber,
        });

        return {
            title: issue.title,
            description: issue.body ?? null,
            author: issue.user?.login ?? "",
            state: this.mapIssueState(issue.state, issue.locked ?? false),
            labels: issue.labels.map((label) => (typeof label === "string" ? label : (label.name ?? ""))),
        };
    }

    public async fetchIssueCommentList(issueNumber: number, options?: ListPaginationOptions): Promise<GitComment[]> {
        const mapComment = (comment: {
            id: number;
            body?: string | null;
            user?: { login?: string } | null;
            created_at: string;
        }): GitComment => ({
            id: comment.id,
            body: comment.body ?? "",
            author: comment.user?.login ?? "",
            createdAt: comment.created_at,
        });

        if (options) {
            const { data } = await this.octokit.issues.listComments({
                owner: this.owner,
                repo: this.repo,
                issue_number: issueNumber,
                page: options.page,
                per_page: options.limit,
            });
            return data.map(mapComment);
        }

        const commentList: GitComment[] = [];
        for (let page = 1; ; page++) {
            const response = await this.octokit.issues.listComments({
                owner: this.owner,
                repo: this.repo,
                issue_number: issueNumber,
                page,
                per_page: 100,
            });
            commentList.push(...response.data.map(mapComment));
            if (!response.headers.link?.includes('rel="next"')) {
                break;
            }
        }
        return commentList;
    }

    public async createIssueComment(issueNumber: number, body: string): Promise<GitComment> {
        const { data: comment } = await this.octokit.issues.createComment({
            owner: this.owner,
            repo: this.repo,
            issue_number: issueNumber,
            body,
        });

        return {
            id: comment.id,
            body: comment.body ?? "",
            author: comment.user?.login ?? "",
            createdAt: comment.created_at,
        };
    }

    public async searchIssueList(query: string): Promise<GitRelatedItem[]> {
        const { data } = await this.octokit.search.issuesAndPullRequests({
            q: `${query} repo:${this.owner}/${this.repo} is:issue`,
            per_page: 10,
        });

        return data.items.map((item) => ({
            number: item.number,
            title: item.title,
            description: item.body ?? null,
            state: item.state === "closed" ? "closed" : "opened",
            author: item.user?.login ?? "",
            url: item.html_url,
        }));
    }

    public async searchPullRequestList(query: string): Promise<GitRelatedItem[]> {
        const { data } = await this.octokit.search.issuesAndPullRequests({
            q: `${query} repo:${this.owner}/${this.repo} is:pr`,
            per_page: 10,
        });

        return data.items.map((item) => ({
            number: item.number,
            title: item.title,
            description: item.body ?? null,
            state: item.pull_request?.merged_at ? "merged" : item.state === "closed" ? "closed" : "opened",
            author: item.user?.login ?? "",
            url: item.html_url,
        }));
    }

    public async searchCodeList(query: string, ref: string): Promise<GitCodeSearchResult[]> {
        const { data } = await this.octokit.request("GET /search/code", {
            q: `${query} repo:${this.owner}/${this.repo}`,
            per_page: 10,
            headers: {
                accept: "application/vnd.github.text-match+json",
            },
        });

        return data.items.map((item: { path: string; text_matches?: Array<{ fragment?: string }> }) => ({
            path: item.path,
            ref,
            snippet: item.text_matches?.[0]?.fragment ?? "",
        }));
    }

    public isCodeSearchSupported(): boolean {
        return false;
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

    public async fetchPullRequestReviewerList(prNumber: number): Promise<string[]> {
        const { data: pr } = await this.octokit.pulls.get({
            owner: this.owner,
            repo: this.repo,
            pull_number: prNumber,
        });

        const reviewers: string[] = [];

        if (pr.requested_reviewers) {
            reviewers.push(...pr.requested_reviewers.map((r) => r.login));
        }

        if (pr.requested_teams) {
            reviewers.push(...pr.requested_teams.map((t) => t.slug));
        }

        return reviewers;
    }

    public async fetchDirectoryTree(filePath: string, ref: string, recursive?: boolean): Promise<GitTree[]> {
        if (recursive) {
            const { data: tree } = await this.octokit.git.getTree({
                owner: this.owner,
                repo: this.repo,
                tree_sha: ref,
                recursive: "true",
            });

            const prefix = filePath ? `${filePath}/` : "";
            const filtered = tree.tree.filter((node) => node.path?.startsWith(prefix));

            return filtered.map((node) => {
                const path = node.path ?? "";
                return {
                    name: path.split("/").pop() ?? path,
                    path,
                    type: node.type === "tree" ? "directory" : "file",
                };
            });
        }

        const { data } = await this.octokit.repos.getContent({
            owner: this.owner,
            repo: this.repo,
            path: filePath,
            ref,
        });

        if (!Array.isArray(data)) {
            return [];
        }

        return data.map((item) => ({
            name: item.name,
            path: item.path,
            type: item.type === "dir" ? "directory" : "file",
        }));
    }

    public async fetchFileContent(filePath: string, ref?: string): Promise<string> {
        try {
            const { data } = await this.octokit.repos.getContent({
                owner: this.owner,
                repo: this.repo,
                path: filePath,
                ref,
            });

            if (Array.isArray(data)) {
                throw new Error(`Path is a directory, not a file: ${filePath}`);
            }

            if ("content" in data) {
                return Buffer.from(data.content, "base64").toString("utf-8");
            }

            throw new Error(`Failed to fetch file content: ${filePath}`);
        } catch (error) {
            if (
                typeof error === "object" &&
                error !== null &&
                ((error as { status?: number }).status === 404 ||
                    (error as { response?: { status?: number } }).response?.status === 404)
            ) {
                throw new Error(`File not found: ${filePath}`);
            }
            throw error;
        }
    }

    public async createPullRequestComment(prNumber: number, body: string): Promise<GitComment> {
        return this.createIssueComment(prNumber, body);
    }

    public async fetchPullRequestInlineReviewList(
        prNumber: number,
        options?: ListPaginationOptions,
    ): Promise<GitPullRequestInlineReview[]> {
        const inlineReviewList = buildInlineReviewList(await this.fetchPullRequestInlineReviewCommentList(prNumber));
        if (!options) {
            return inlineReviewList;
        }
        const start = (options.page - 1) * options.limit;
        return inlineReviewList.slice(start, start + options.limit);
    }

    public async fetchPullRequestInlineReview(
        prNumber: number,
        inlineReviewId: string,
    ): Promise<GitPullRequestInlineReview> {
        const inlineReviewList = await this.fetchPullRequestInlineReviewList(prNumber);
        const review = findInlineReviewById(inlineReviewList, inlineReviewId);
        if (!review) {
            throw new Error(`Inline review not found: ${inlineReviewId}`);
        }
        return review;
    }

    public async replyToPullRequestInlineReview(
        prNumber: number,
        inlineReviewId: string,
        body: string,
    ): Promise<GitComment> {
        const inlineReviewCommentList = await this.fetchPullRequestInlineReviewCommentList(prNumber);
        const rootId = resolveInlineReviewRootId(Number(inlineReviewId), inlineReviewCommentList);

        const { data: comment } = await this.octokit.pulls.createReplyForReviewComment({
            owner: this.owner,
            repo: this.repo,
            pull_number: prNumber,
            comment_id: rootId,
            body,
        });

        return {
            id: comment.id,
            body: comment.body ?? "",
            author: comment.user?.login ?? "",
            createdAt: comment.created_at,
        };
    }

    public async fetchPullRequestVersion(prNumber: number): Promise<GitPullRequestVersion> {
        const { data: pr } = await this.octokit.pulls.get({
            owner: this.owner,
            repo: this.repo,
            pull_number: prNumber,
        });

        return {
            headSha: pr.head.sha,
            baseSha: pr.base.sha,
            startSha: pr.base.sha,
        };
    }

    public async createCommentToSingleLine(
        prNumber: number,
        body: string,
        position: GitDiffSingleLine,
    ): Promise<GitComment> {
        if (position.newLine === undefined && position.oldLine === undefined) {
            throw new Error("Either newLine or oldLine is required.");
        }

        const side = position.newLine !== undefined ? "RIGHT" : "LEFT";
        const line = position.newLine ?? position.oldLine;
        if (line === undefined) {
            throw new Error("Either newLine or oldLine is required.");
        }
        const path =
            side === "LEFT" && position.oldPath !== position.newPath
                ? position.oldPath
                : position.newPath;

        try {
            const { data: comment } = await this.octokit.pulls.createReviewComment({
                owner: this.owner,
                repo: this.repo,
                pull_number: prNumber,
                body,
                commit_id: position.headSha,
                path,
                line,
                side,
            });

            return {
                id: comment.id,
                body: comment.body ?? "",
                author: comment.user?.login ?? "",
                createdAt: comment.created_at,
            };
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            if (message.toLowerCase().includes("could not be resolved")) {
                throw new Error(
                    `${message} Re-check get_file_diff and anchor to a line inside a diff hunk, or put the finding in the summary.`,
                );
            }
            throw error;
        }
    }

    public async createCommentToMultiLine(
        prNumber: number,
        body: string,
        position: GitDiffMultiLine,
    ): Promise<GitComment> {
        const { data: comment } = await this.octokit.pulls.createReviewComment({
            owner: this.owner,
            repo: this.repo,
            pull_number: prNumber,
            body,
            commit_id: position.headSha,
            path: position.newPath,
            start_line: position.start.newLine,
            start_side: position.start.type === "new" ? "RIGHT" : "LEFT",
            line: position.end.newLine,
            side: position.end.type === "new" ? "RIGHT" : "LEFT",
        });

        return {
            id: comment.id,
            body: comment.body ?? "",
            author: comment.user?.login ?? "",
            createdAt: comment.created_at,
        };
    }

    public async approvePullRequest(prNumber: number): Promise<void> {
        await this.octokit.pulls.createReview({
            owner: this.owner,
            repo: this.repo,
            pull_number: prNumber,
            event: "APPROVE",
        });
    }

    public async unapprovePullRequest(prNumber: number): Promise<void> {
        const { data: pullReviewList } = await this.octokit.pulls.listReviews({
            owner: this.owner,
            repo: this.repo,
            pull_number: prNumber,
        });

        const userReview = pullReviewList.find((r) => r.state === "APPROVED");
        if (userReview) {
            await this.octokit.pulls.dismissReview({
                owner: this.owner,
                repo: this.repo,
                pull_number: prNumber,
                review_id: userReview.id,
                message: "Dismissed by bot",
            });
        }
    }

    public async assignPullRequestReviewer(prNumber: number): Promise<void> {
        const user = await this.fetchCurrentUser();

        await this.octokit.pulls.requestReviewers({
            owner: this.owner,
            repo: this.repo,
            pull_number: prNumber,
            reviewers: [user.username],
        });
    }

    public async fetchRepositoryList(): Promise<GitRepositoryListItem[]> {
        const { data: repos } = await this.octokit.repos.listForAuthenticatedUser({
            per_page: 100,
        });

        return repos.map((repo) => ({
            id: repo.id,
            name: repo.name,
            fullName: repo.full_name,
            description: repo.description,
            defaultBranch: repo.default_branch ?? "main",
        }));
    }

    private async fetchPullRequestInlineReviewCommentList(prNumber: number): Promise<InlineReviewComment[]> {
        const inlineReviewCommentList: InlineReviewComment[] = [];
        for (let page = 1; ; page++) {
            const response = await this.octokit.pulls.listReviewComments({
                owner: this.owner,
                repo: this.repo,
                pull_number: prNumber,
                page,
                per_page: 100,
            });
            inlineReviewCommentList.push(
                ...response.data.map((comment) => ({
                    id: comment.id,
                    body: comment.body ?? "",
                    author: comment.user?.login ?? "",
                    createdAt: comment.created_at,
                    inReplyToId: comment.in_reply_to_id ?? null,
                    path: comment.path ?? null,
                    line: comment.line,
                    originalLine: comment.original_line,
                    startLine: comment.start_line,
                    side: comment.side,
                    startSide: comment.start_side,
                })),
            );
            if (!response.headers.link?.includes('rel="next"')) {
                break;
            }
        }
        return inlineReviewCommentList;
    }

    private mapPRState(state: string, merged: boolean | null): GitPullRequestState {
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
