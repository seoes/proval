import { Gitlab, type MergeRequestReviewerSchema } from "@gitbeaker/rest";
import type {
    GitComment,
    GitChangedFile,
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

export class GitLabProvider implements GitProvider {
    private readonly gitlab: Gitlab;
    constructor(
        private readonly baseUrl: string,
        private readonly token: string,
        private readonly projectId: number,
    ) {
        this.gitlab = new Gitlab({
            host: baseUrl,
            token: token,
        });
    }

    public static async createProjectAccessToken(
        baseUrl: string,
        personalAccessToken: string,
        projectId: number,
    ): Promise<{ token: string; tokenId: number }> {
        const today = new Date();
        const nextYearStr = new Date(today.getFullYear() + 1, today.getMonth(), today.getDate())
            .toISOString()
            .split("T")[0];
        const gitlab = new Gitlab({
            host: baseUrl,
            token: personalAccessToken,
        });
        const { token, id } = await gitlab.ProjectAccessTokens.create(
            projectId,
            "Proval [BOT]",
            ["api", "read_repository"],
            nextYearStr,
            { accessLevel: 40 }, // 40 = Maintainer
        );
        return { token, tokenId: id };
    }

    public static async rotateProjectAccessToken(
        baseUrl: string,
        personalAccessToken: string,
        projectId: number,
        projectAccessTokenId: number,
    ): Promise<{ token: string; tokenId: number }> {
        const gitlab = new Gitlab({
            host: baseUrl,
            token: personalAccessToken,
        });
        const { token, id } = await gitlab.ProjectAccessTokens.rotate(projectId, projectAccessTokenId);
        return { token, tokenId: id };
    }

    public static async removeProjectAccessToken(
        baseUrl: string,
        personalAccessToken: string,
        projectId: number,
        projectAccessTokenId: number,
    ): Promise<void> {
        const gitlab = new Gitlab({
            host: baseUrl,
            token: personalAccessToken,
        });
        await gitlab.ProjectAccessTokens.revoke(projectId, projectAccessTokenId);
    }

    public async fetchRepositoryDetail(): Promise<GitRepository> {
        const repository = await this.gitlab.Projects.show(this.projectId);
        return {
            id: repository.id,
            name: repository.name,
            description: repository.description,
            defaultBranch: repository.default_branch ?? "main",
        };
    }

    public async fetchRepositoryPath(): Promise<string> {
        const repository = await this.gitlab.Projects.show(this.projectId);
        const path = repository.path_with_namespace?.trim();
        if (!path) {
            throw new Error("GitLab project path is missing");
        }
        return path;
    }

    public async fetchPullRequestDetail(prIid: number): Promise<GitPullRequest> {
        const mergeRequest = await this.gitlab.MergeRequests.show(this.projectId, prIid);
        return {
            title: mergeRequest.title,
            description: mergeRequest.description,
            sourceBranch: mergeRequest.source_branch,
            targetBranch: mergeRequest.target_branch,
            author: mergeRequest.author.username,
            state: mergeRequest.state as GitPullRequestState,
        };
    }

    public async fetchChangedFileList(prIid: number): Promise<GitChangedFile[]> {
        const changes = await this.gitlab.MergeRequests.allDiffs(this.projectId, prIid);
        return changes.map((change) => ({
            oldPath: change.old_path,
            newPath: change.new_path,
            newFile: change.new_file,
            renamedFile: change.renamed_file,
            deletedFile: change.deleted_file,
        }));
    }

    public async fetchFileDiff(prIid: number, filePath: string): Promise<GitDiff> {
        const changes = await this.gitlab.MergeRequests.allDiffs(this.projectId, prIid);
        const change = changes.find((item) => item.new_path === filePath || item.old_path === filePath);
        if (!change) {
            throw new Error(`Changed file not found in pull request: ${filePath}`);
        }
        return {
            oldPath: change.old_path,
            newPath: change.new_path,
            newFile: change.new_file,
            renamedFile: change.renamed_file,
            deletedFile: change.deleted_file,
            diff: change.diff,
        };
    }

    public async fetchPullRequestCommentList(prIid: number): Promise<GitComment[]> {
        const comments = await this.gitlab.MergeRequestNotes.all(this.projectId, prIid);
        return comments.map((comment) => ({
            id: comment.id,
            body: comment.body,
            author: comment.author.username,
            createdAt: comment.created_at,
        }));
    }

    public async fetchIssueDetail(issueIid: number): Promise<GitIssue> {
        const issue = await this.requestJson<{
            title: string;
            description: string | null;
            state: string;
            author?: { username?: string };
            labels?: string[];
        }>(`/projects/${encodeURIComponent(String(this.projectId))}/issues/${issueIid}`);

        return {
            title: issue.title,
            description: issue.description,
            author: issue.author?.username ?? "",
            state: this.mapIssueState(issue.state),
            labels: issue.labels ?? [],
        };
    }

    public async fetchIssueCommentList(issueIid: number): Promise<GitComment[]> {
        const comments = await this.requestJson<
            Array<{
                id: number;
                body: string;
                created_at: string;
                author?: { username?: string };
            }>
        >(`/projects/${encodeURIComponent(String(this.projectId))}/issues/${issueIid}/notes`);

        return comments.map((comment) => ({
            id: comment.id,
            body: comment.body,
            author: comment.author?.username ?? "",
            createdAt: comment.created_at,
        }));
    }

    public async createIssueComment(issueIid: number, body: string): Promise<GitComment> {
        const comment = await this.requestJson<{
            id: number;
            body: string;
            created_at: string;
            author?: { username?: string };
        }>(`/projects/${encodeURIComponent(String(this.projectId))}/issues/${issueIid}/notes`, {
            method: "POST",
            body: JSON.stringify({ body }),
        });

        return {
            id: comment.id,
            body: comment.body,
            author: comment.author?.username ?? "",
            createdAt: comment.created_at,
        };
    }

    public async searchIssueList(query: string): Promise<GitRelatedItem[]> {
        const result = await this.requestJson<
            Array<{
                iid: number;
                title: string;
                description: string | null;
                state: string;
                web_url?: string;
                author?: { username?: string };
            }>
        >(
            `/projects/${encodeURIComponent(String(this.projectId))}/issues?state=all&search=${encodeURIComponent(query)}`,
        );

        return result.map((issue) => ({
            number: issue.iid,
            title: issue.title,
            description: issue.description,
            state: issue.state === "closed" ? "closed" : "opened",
            author: issue.author?.username ?? "",
            url: issue.web_url ?? "",
        }));
    }

    public async searchPullRequestList(query: string): Promise<GitRelatedItem[]> {
        const result = await this.requestJson<
            Array<{
                iid: number;
                title: string;
                description: string | null;
                state: string;
                web_url?: string;
                author?: { username?: string };
            }>
        >(
            `/projects/${encodeURIComponent(String(this.projectId))}/merge_requests?state=all&search=${encodeURIComponent(query)}`,
        );

        return result.map((mergeRequest) => ({
            number: mergeRequest.iid,
            title: mergeRequest.title,
            description: mergeRequest.description,
            state: this.mapPullRequestState(mergeRequest.state),
            author: mergeRequest.author?.username ?? "",
            url: mergeRequest.web_url ?? "",
        }));
    }

    public async searchCodeList(query: string, ref: string): Promise<GitCodeSearchResult[]> {
        const result = await this.requestJson<
            Array<{
                filename?: string;
                path?: string;
                ref?: string;
                data?: string;
            }>
        >(
            `/projects/${encodeURIComponent(String(this.projectId))}/search?scope=blobs&ref=${encodeURIComponent(ref)}&search=${encodeURIComponent(query)}`,
        );

        return result.map((item) => ({
            path: item.path ?? item.filename ?? "",
            ref: item.ref ?? ref,
            snippet: item.data ?? "",
        }));
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

    public async fetchDirectoryTree(filePath: string, ref: string, recursive?: boolean): Promise<GitTree[]> {
        const tree = await this.gitlab.Repositories.allRepositoryTrees(this.projectId, {
            path: filePath,
            ref,
            recursive,
        });
        return tree.map((node) => ({
            name: node.name,
            path: node.path,
            type: node.type === "tree" ? "directory" : "file",
        }));
    }

    public async fetchFileContent(filePath: string, ref?: string): Promise<string> {
        const branchOrSha = ref ?? (await this.fetchRepositoryDetail()).defaultBranch;
        const response = await this.gitlab.RepositoryFiles.show(this.projectId, filePath, branchOrSha);
        if (response.encoding === "base64") {
            return Buffer.from(response.content, "base64").toString("utf-8");
        }
        return response.content;
    }

    public async createPullRequestComment(prIid: number, body: string): Promise<GitComment> {
        const comment = await this.gitlab.MergeRequestNotes.create(this.projectId, prIid, body);
        return {
            id: comment.id,
            body: comment.body,
            author: comment.author.username,
            createdAt: comment.created_at,
        };
    }

    public async fetchCurrentUser(): Promise<GitUser> {
        const user = await this.gitlab.Users.showCurrentUser();
        return { username: user.username };
    }

    public async fetchPullRequestReviewerList(prIid: number): Promise<string[]> {
        const mr = await this.gitlab.MergeRequests.show(this.projectId, prIid);
        return (mr.reviewers ?? []).map((r: { username: string }) => r.username);
    }

    public async fetchPullRequestVersion(prIid: number): Promise<GitPullRequestVersion> {
        const versions = await this.gitlab.MergeRequests.allDiffVersions(this.projectId, prIid);
        const latest = versions[0];
        return {
            headSha: latest.head_commit_sha,
            baseSha: latest.base_commit_sha,
            startSha: latest.start_commit_sha,
        };
    }

    public async createCommentToSingleLine(
        prIid: number,
        body: string,
        position: GitDiffSingleLine,
    ): Promise<GitComment> {
        const discussion = await this.gitlab.MergeRequestDiscussions.create(this.projectId, prIid, body, {
            position: {
                positionType: "text",
                baseSha: position.baseSha,
                startSha: position.startSha,
                headSha: position.headSha,
                oldPath: position.oldPath,
                newPath: position.newPath,
                ...(position.newLine !== undefined && { newLine: String(position.newLine) }),
                ...(position.oldLine !== undefined && { oldLine: String(position.oldLine) }),
            },
        });

        const note = discussion.notes?.[0];
        if (!note) {
            throw new Error("Failed to create inline comment: no note returned");
        }
        return {
            id: note.id,
            body: note.body,
            author: note.author.username,
            createdAt: note.created_at,
        };
    }

    public async createCommentToMultiLine(
        prIid: number,
        body: string,
        position: GitDiffMultiLine,
    ): Promise<GitComment> {
        // GitLab expects the "anchor" new_line/old_line to be the last line of the selected range.
        const anchorNewLine = position.end.type === "new" ? position.end.newLine : undefined;
        const anchorOldLine = position.end.type === "old" ? position.end.oldLine : undefined;

        const discussion = await this.gitlab.MergeRequestDiscussions.create(this.projectId, prIid, body, {
            position: {
                positionType: "text",
                baseSha: position.baseSha,
                startSha: position.startSha,
                headSha: position.headSha,
                oldPath: position.oldPath,
                newPath: position.newPath,
                ...(anchorNewLine !== undefined && { newLine: String(anchorNewLine) }),
                ...(anchorOldLine !== undefined && { oldLine: String(anchorOldLine) }),
                lineRange: {
                    start: {
                        type: position.start.type,
                        ...(position.start.newLine !== undefined && {
                            newLine: position.start.newLine,
                        }),
                        ...(position.start.oldLine !== undefined && {
                            oldLine: position.start.oldLine,
                        }),
                    },
                    end: {
                        type: position.end.type,
                        ...(position.end.newLine !== undefined && {
                            newLine: position.end.newLine,
                        }),
                        ...(position.end.oldLine !== undefined && {
                            oldLine: position.end.oldLine,
                        }),
                    },
                },
            },
        });

        const note = discussion.notes?.[0];
        if (!note) {
            throw new Error("Failed to create multi-line inline comment: no note returned");
        }
        return {
            id: note.id,
            body: note.body,
            author: note.author.username,
            createdAt: note.created_at,
        };
    }

    public async approvePullRequest(prIid: number): Promise<void> {
        await this.gitlab.MergeRequestApprovals.approve(this.projectId, prIid);
    }

    public async unapprovePullRequest(prIid: number): Promise<void> {
        await this.gitlab.MergeRequestApprovals.unapprove(this.projectId, prIid);
    }

    public async assignPullRequestReviewer(prIid: number): Promise<void> {
        const user = await this.gitlab.Users.showCurrentUser();
        const reviewerList = await this.gitlab.MergeRequests.showReviewers(this.projectId, prIid);
        await this.gitlab.MergeRequests.edit(this.projectId, prIid, {
            reviewerIds: [...reviewerList.map((r: MergeRequestReviewerSchema) => r.user.id), user.id],
        });
    }

    public async fetchRepositoryList(): Promise<GitRepositoryListItem[]> {
        const projects = await this.requestJson<
            Array<{
                id: number;
                name: string;
                path_with_namespace: string;
                description: string | null;
                default_branch: string;
            }>
        >("/projects?membership=true&per_page=100");

        return projects.map((project) => ({
            id: project.id,
            name: project.name,
            fullName: project.path_with_namespace,
            description: project.description,
            defaultBranch: project.default_branch ?? "main",
        }));
    }

    private async requestJson<T>(path: string, init?: RequestInit): Promise<T> {
        const url = new URL(`/api/v4${path}`, this.baseUrl);
        const response = await fetch(url, {
            ...init,
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${this.token}`,
                ...(init?.headers ?? {}),
            },
        });

        if (!response.ok) {
            throw new Error(`GitLab request failed: ${response.status} ${response.statusText}`);
        }

        return (await response.json()) as T;
    }

    private mapIssueState(state: string): GitIssueState {
        if (state === "closed") return "closed";
        if (state === "locked") return "locked";
        return "opened";
    }

    private mapPullRequestState(state: string): "opened" | "closed" | "merged" {
        if (state === "merged") return "merged";
        if (state === "closed") return "closed";
        return "opened";
    }
}
