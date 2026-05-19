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
    GitMergeRequest,
    GitMergeRequestState,
    GitMergeRequestVersion,
    GitProvider,
    GitRelatedItem,
    GitRepository,
    GitTree,
    GitUser,
    GitRepositoryListItem,
} from "./types.js";

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

    public async fetchMergeRequestDetail(prNumber: number): Promise<GitMergeRequest> {
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

    public async fetchChangedFileList(prNumber: number): Promise<GitChangedFile[]> {
        const { data: files } = await this.octokit.pulls.listFiles({
            owner: this.owner,
            repo: this.repo,
            pull_number: prNumber,
        });

        return files.map((file) => ({
            oldPath: file.previous_filename ?? file.filename,
            newPath: file.filename,
            newFile: file.status === "added",
            renamedFile: file.status === "renamed",
            deletedFile: file.status === "removed",
        }));
    }

    public async fetchFileDiff(prNumber: number, filePath: string): Promise<GitDiff> {
        const { data: files } = await this.octokit.pulls.listFiles({
            owner: this.owner,
            repo: this.repo,
            pull_number: prNumber,
        });

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

    public async fetchMergeRequestCommentList(prNumber: number): Promise<GitComment[]> {
        const [issueComments, reviewComments] = await Promise.all([
            this.octokit.issues.listComments({
                owner: this.owner,
                repo: this.repo,
                issue_number: prNumber,
            }),
            this.octokit.pulls.listReviewComments({
                owner: this.owner,
                repo: this.repo,
                pull_number: prNumber,
            }),
        ]);

        const comments: GitComment[] = [];

        for (const comment of issueComments.data) {
            comments.push({
                id: comment.id,
                body: comment.body ?? "",
                author: comment.user?.login ?? "",
                createdAt: comment.created_at,
            });
        }

        for (const comment of reviewComments.data) {
            comments.push({
                id: comment.id,
                body: comment.body ?? "",
                author: comment.user?.login ?? "",
                createdAt: comment.created_at,
            });
        }

        comments.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

        return comments;
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
            labels: issue.labels.map((label) => (typeof label === "string" ? label : label.name ?? "")),
        };
    }

    public async fetchIssueCommentList(issueNumber: number): Promise<GitComment[]> {
        const { data: comments } = await this.octokit.issues.listComments({
            owner: this.owner,
            repo: this.repo,
            issue_number: issueNumber,
        });

        return comments.map((comment) => ({
            id: comment.id,
            body: comment.body ?? "",
            author: comment.user?.login ?? "",
            createdAt: comment.created_at,
        }));
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

    public async searchMergeRequestList(query: string): Promise<GitRelatedItem[]> {
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

        return data.items.map((item: {
            path: string;
            name: string;
            html_url?: string;
            text_matches?: Array<{ fragment?: string }>;
        }) => ({
            path: item.path,
            name: item.name,
            ref,
            snippet: item.text_matches?.[0]?.fragment ?? "",
            url: item.html_url,
        }));
    }

    public async fetchMergeRequestReviewerList(prNumber: number): Promise<string[]> {
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
                const relativePath = node.path?.slice(prefix.length) ?? "";
                return {
                    name: relativePath.split("/")[0],
                    path: node.path ?? "",
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
        const { data } = await this.octokit.repos.getContent({
            owner: this.owner,
            repo: this.repo,
            path: filePath,
            ref,
        });

        if (Array.isArray(data)) {
            throw new Error(`Expected file content but got directory: ${filePath}`);
        }

        if ("content" in data) {
            return Buffer.from(data.content, "base64").toString("utf-8");
        }

        throw new Error(`Failed to fetch file content: ${filePath}`);
    }

    public async createMergeRequestComment(prNumber: number, body: string): Promise<GitComment> {
        return this.createIssueComment(prNumber, body);
    }

    public async fetchMergeRequestVersion(prNumber: number): Promise<GitMergeRequestVersion> {
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
        const { data: comment } = await this.octokit.pulls.createReviewComment({
            owner: this.owner,
            repo: this.repo,
            pull_number: prNumber,
            body,
            commit_id: position.headSha,
            path: position.newPath,
            ...(position.newLine !== undefined && {
                line: position.newLine,
                side: "RIGHT",
            }),
            ...(position.oldLine !== undefined && {
                line: position.oldLine,
                side: "LEFT",
            }),
        });

        return {
            id: comment.id,
            body: comment.body ?? "",
            author: comment.user?.login ?? "",
            createdAt: comment.created_at,
        };
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

    public async approveMergeRequest(prNumber: number): Promise<void> {
        await this.octokit.pulls.createReview({
            owner: this.owner,
            repo: this.repo,
            pull_number: prNumber,
            event: "APPROVE",
        });
    }

    public async unapproveMergeRequest(prNumber: number): Promise<void> {
        const { data: reviews } = await this.octokit.pulls.listReviews({
            owner: this.owner,
            repo: this.repo,
            pull_number: prNumber,
        });

        const userReview = reviews.find((r) => r.state === "APPROVED");
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

    public async assignMergeRequestReviewer(prNumber: number): Promise<void> {
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

    private mapPRState(state: string, merged: boolean | null): GitMergeRequestState {
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
