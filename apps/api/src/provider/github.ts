import { Octokit } from "@octokit/rest";
import type {
    GitChangedFile,
    GitComment,
    GitDiff,
    GitDiffMultiLine,
    GitDiffSingleLine,
    GitMergeRequest,
    GitMergeRequestState,
    GitMergeRequestVersion,
    GitProvider,
    GitTree,
    GitUser,
} from "./types.js";

export class GitHubProvider implements GitProvider {
    private readonly octokit: Octokit;

    constructor(
        token: string,
        private readonly owner: string,
        private readonly repo: string,
        baseUrl?: string,
    ) {
        this.octokit = new Octokit({
            baseUrl: baseUrl ?? "https://api.github.com",
            auth: token,
        });
    }

    public async fetchCurrentUser(): Promise<GitUser> {
        const { data: user } = await this.octokit.users.getAuthenticated();
        return { username: user.login };
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
        const { data: tree } = await this.octokit.git.getTree({
            owner: this.owner,
            repo: this.repo,
            tree_sha: `${ref}:${filePath}`,
            recursive: recursive ? "true" : undefined,
        });

        return tree.tree.map((node) => ({
            name: node.path?.split("/").pop() ?? "",
            path: node.path ?? "",
            type: node.type === "tree" ? "directory" : "file",
        }));
    }

    public async fetchFileContent(filePath: string, ref?: string): Promise<string> {
        const refPath = ref ? `${ref}:${filePath}` : filePath;
        const { data } = await this.octokit.repos.getContent({
            owner: this.owner,
            repo: this.repo,
            path: refPath,
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
        const { data: comment } = await this.octokit.issues.createComment({
            owner: this.owner,
            repo: this.repo,
            issue_number: prNumber,
            body,
        });

        return {
            id: comment.id,
            body: comment.body ?? "",
            author: comment.user?.login ?? "",
            createdAt: comment.created_at,
        };
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

    private mapPRState(state: string, merged: boolean | null): GitMergeRequestState {
        if (merged) return "merged";
        if (state === "open") return "opened";
        return "closed";
    }
}
