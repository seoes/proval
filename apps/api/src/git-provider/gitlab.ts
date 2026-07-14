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
    GitPullRequestInlineReview,
    GitDiffLine,
    ListPaginationOptions,
} from "./types.js";

type GitLabInlineNotePosition = {
    new_path?: string;
    old_path?: string;
    new_line?: string | number;
    old_line?: string | number;
    line_range?: {
        start?: { type?: "new" | "old"; old_line?: number; new_line?: number };
        end?: { type?: "new" | "old"; old_line?: number; new_line?: number };
    };
};

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

    public async downloadArchive(ref: string, destPath: string): Promise<void> {
        const host = this.baseUrl.replace(/\/$/, "");
        const url = `${host}/api/v4/projects/${this.projectId}/repository/archive.tar.gz?sha=${encodeURIComponent(ref)}`;
        const response = await fetch(url, {
            headers: { Authorization: `Bearer ${this.token}` },
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`GitLab archive download failed (${response.status}): ${errorText}`);
        }
        await Bun.write(destPath, response);
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

    public async fetchPullRequestDiffList(prIid: number): Promise<GitDiff[]> {
        const changes = await this.gitlab.MergeRequests.allDiffs(this.projectId, prIid);
        return changes.map((change) => ({
            oldPath: change.old_path,
            newPath: change.new_path,
            newFile: change.new_file,
            renamedFile: change.renamed_file,
            deletedFile: change.deleted_file,
            diff: change.diff,
        }));
    }

    public async fetchFileDiff(prIid: number, filePath: string): Promise<GitDiff> {
        const changes = await this.fetchPullRequestDiffList(prIid);
        const change = changes.find((item) => item.newPath === filePath || item.oldPath === filePath);
        if (!change) {
            throw new Error(`Changed file not found in pull request: ${filePath}`);
        }
        return change;
    }

    public async fetchPullRequestComment(prIid: number, commentId: number): Promise<GitComment> {
        const comment = await this.gitlab.MergeRequestNotes.show(this.projectId, prIid, commentId);
        return {
            id: comment.id,
            body: comment.body,
            author: comment.author.username,
            createdAt: comment.created_at,
        };
    }

    public async fetchPullRequestInlineReviewComment(prIid: number, commentId: number): Promise<GitComment> {
        return this.fetchPullRequestComment(prIid, commentId);
    }

    public async fetchPullRequestCommentList(prIid: number, options?: ListPaginationOptions): Promise<GitComment[]> {
        const inlineReviewList = await this.loadPullRequestInlineReviewList(prIid);
        const inlineNoteIds = new Set(inlineReviewList.flatMap((review) => review.commentList.map((c) => c.id)));

        const noteList = await this.gitlab.MergeRequestNotes.all(this.projectId, prIid);
        const commentList = noteList
            .filter((comment) => !comment.system && !inlineNoteIds.has(comment.id))
            .map((comment) => ({
                id: comment.id,
                body: comment.body,
                author: comment.author.username,
                createdAt: comment.created_at,
            }))
            .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

        if (!options) {
            return commentList;
        }
        const start = (options.page - 1) * options.limit;
        return commentList.slice(start, start + options.limit);
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

    public async fetchIssueComment(issueIid: number, commentId: number): Promise<GitComment> {
        const comment = await this.gitlab.IssueNotes.show(this.projectId, issueIid, commentId);
        return {
            id: comment.id,
            body: comment.body,
            author: comment.author.username,
            createdAt: comment.created_at,
        };
    }

    public async fetchIssueCommentList(issueIid: number, options?: ListPaginationOptions): Promise<GitComment[]> {
        if (!options) {
            const noteList = await this.gitlab.IssueNotes.all(this.projectId, issueIid);
            return noteList
                .filter((comment) => !comment.system)
                .map((comment) => ({
                    id: comment.id,
                    body: comment.body,
                    author: comment.author.username,
                    createdAt: comment.created_at,
                }));
        }

        const { page, limit } = options;
        const path = `/projects/${encodeURIComponent(String(this.projectId))}/issues/${issueIid}/notes?page=${page}&per_page=${limit}`;
        const data = await this.requestJson<
            Array<{
                id: number;
                body: string;
                created_at: string;
                system?: boolean;
                author?: { username?: string };
            }>
        >(path);

        return data
            .filter((comment) => !comment.system)
            .map((comment) => ({
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
        console.log("tree 1");
        const tree = await this.gitlab.Repositories.allRepositoryTrees(this.projectId, {
            path: filePath,
            ref,
            recursive,
        });
        console.log("tree 2");
        return tree.map((node) => ({
            name: node.name,
            path: node.path,
            type: node.type === "tree" ? "directory" : "file",
        }));
    }

    public async fetchFileContent(filePath: string, ref?: string): Promise<string> {
        const branchOrSha = ref ?? (await this.fetchRepositoryDetail()).defaultBranch;
        try {
            const response = await this.gitlab.RepositoryFiles.show(this.projectId, filePath, branchOrSha);
            if (response.encoding === "base64") {
                return Buffer.from(response.content, "base64").toString("utf-8");
            }
            return response.content;
        } catch (error) {
            if (
                typeof error === "object" &&
                error !== null &&
                ((error as { response?: { status?: number } }).response?.status === 404 ||
                    (error as { cause?: { response?: { status?: number } } }).cause?.response?.status === 404)
            ) {
                throw new Error(`File not found: ${filePath}`);
            }
            throw error;
        }
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

    public async fetchPullRequestInlineReview(
        prIid: number,
        inlineReviewId: string,
    ): Promise<GitPullRequestInlineReview> {
        const review = await this.gitlab.MergeRequestDiscussions.show(this.projectId, prIid, inlineReviewId);
        const mapped = this.mapDiscussionToInlineReview(review);
        if (!mapped) {
            throw new Error(`Inline review not found for discussion: ${inlineReviewId}`);
        }
        return mapped;
    }

    public async fetchPullRequestInlineReviewList(
        prIid: number,
        options?: ListPaginationOptions,
    ): Promise<GitPullRequestInlineReview[]> {
        const inlineReviewList = await this.loadPullRequestInlineReviewList(prIid);
        if (!options) {
            return inlineReviewList;
        }
        const start = (options.page - 1) * options.limit;
        return inlineReviewList.slice(start, start + options.limit);
    }

    private async loadPullRequestInlineReviewList(prIid: number): Promise<GitPullRequestInlineReview[]> {
        const discussionList = await this.gitlab.MergeRequestDiscussions.all(this.projectId, prIid);
        return discussionList
            .map((discussion) => this.mapDiscussionToInlineReview(discussion))
            .filter((review): review is GitPullRequestInlineReview => review !== null);
    }

    private mapDiscussionToInlineReview(discussion: {
        id: string;
        notes?: Array<{
            id: number;
            type?: string | null;
            body: string;
            author: { username: string };
            created_at: string;
            system?: boolean;
            resolvable?: boolean;
            position?: unknown;
            resolved?: boolean;
        }>;
    }): GitPullRequestInlineReview | null {
        const noteList = discussion.notes ?? [];
        const anchorNote = noteList.find((n) => n.type === "DiffNote" && n.position) ?? null;
        if (!anchorNote?.position) {
            return null;
        }

        const position = anchorNote.position as GitLabInlineNotePosition;
        const { start, end } = this.mapGitLabPositionToDiffLines(position);
        const resolvableNote = noteList.find((n) => n.resolvable);

        return {
            id: discussion.id,
            path: position.new_path ?? "",
            oldPath: position.old_path,
            start,
            end,
            createdAt: anchorNote.created_at,
            isResolved: resolvableNote ? Boolean(resolvableNote.resolved) : false,
            commentList: noteList
                .filter((n) => !n.system)
                .map((n) => ({
                    id: n.id,
                    body: n.body,
                    author: n.author.username,
                    createdAt: n.created_at,
                })),
        };
    }

    private mapGitLabPositionToDiffLines(position: GitLabInlineNotePosition): { start: GitDiffLine; end: GitDiffLine } {
        const lineRange = position.line_range;
        if (lineRange?.start && lineRange?.end) {
            return {
                start: {
                    type: lineRange.start.type ?? "new",
                    newLine: lineRange.start.new_line,
                    oldLine: lineRange.start.old_line,
                },
                end: {
                    type: lineRange.end.type ?? "new",
                    newLine: lineRange.end.new_line,
                    oldLine: lineRange.end.old_line,
                },
            };
        }

        const newLine = this.parseDiffLineNumber(position.new_line);
        const oldLine = this.parseDiffLineNumber(position.old_line);
        const line: GitDiffLine =
            newLine !== undefined ? { type: "new", newLine, oldLine } : { type: "old", oldLine, newLine };
        return { start: line, end: line };
    }

    private parseDiffLineNumber(value: string | number | undefined): number | undefined {
        if (value === undefined || value === "") {
            return undefined;
        }
        const n = typeof value === "number" ? value : Number(value);
        return Number.isFinite(n) ? n : undefined;
    }

    public async replyToPullRequestInlineReview(
        prIid: number,
        inlineReviewId: string,
        body: string,
    ): Promise<GitComment> {
        const note = await this.gitlab.MergeRequestDiscussions.addNote(this.projectId, prIid, inlineReviewId, body);

        return {
            id: note.id,
            body: note.body,
            author: note.author.username,
            createdAt: note.created_at,
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
