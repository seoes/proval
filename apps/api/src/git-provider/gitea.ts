import {
    emojiList,
    type GitComment,
    type GitCodeSearchResult,
    type GitDiffMultiLine,
    type GitDiffSingleLine,
    type GitIssue,
    type GitRepositoryLabel,
    type GitPullRequest,
    type GitPullRequestInlineReview,
    type GitPullRequestVersion,
    type GitProvider,
    type GitRelatedItem,
    type GitRepository,
    type GitTree,
    type GitUser,
    type GitUserPermissionIdentity,
    type GitRepositoryListItem,
    type GitEmoji,
    type GitEmojiTarget,
    type ListPaginationOptions,
} from "./types.js";
import { log } from "../util/log.js";
import {
    buildInlineReviewList,
    findInlineReviewById,
    resolveInlineReviewRootId,
    type InlineReviewComment,
} from "./inline-review.js";

export type GiteaUser = {
    id: number;
    username: string;
    fullName: string;
    avatarUrl: string | null;
};

export type GiteaOrganization = {
    id: number;
    username: string;
    fullName: string;
    description: string | null;
    avatarUrl: string | null;
};

export type GiteaRepository = {
    id: number;
    name: string;
    fullName: string;
    owner: string;
    description: string | null;
    url: string;
    isPrivate: boolean;
    defaultBranch: string;
    canAccess: boolean;
};

export type GiteaPullRequest = {
    id: number;
    number: number;
    title: string;
    body: string | null;
    author: string;
    sourceBranch: string;
    targetBranch: string;
    createdAt: string;
    updatedAt: string;
    state: "open" | "closed" | "merged";
    url: string;
};

export type PagedRepositoryResult = {
    repositoryList: GiteaRepository[];
    total: number;
    page: number;
    limit: number;
};

export type PagedPullRequestResult = {
    pullRequestList: GiteaPullRequest[];
    total: number;
    page: number;
    limit: number;
};

export type GiteaPullRequestFile = {
    filename: string;
    previousFilename: string | null;
    status: "added" | "modified" | "deleted" | "renamed" | string;
    additions: number;
    deletions: number;
    changes: number;
    patch: string | null;
    isBinary: boolean;
    isTruncated?: boolean;
    rawUrl?: string | null;
};

export type GiteaPullRequestDetailed = {
    id: number;
    number: number;
    title: string;
    body: string | null;
    state: "open" | "closed" | "merged";
    author: string;
    authorAvatarUrl: string | null;
    owner: string;
    repo: string;
    sourceBranch: string;
    targetBranch: string;
    headSha: string;
    baseSha: string;
    createdAt: string;
    updatedAt: string;
    closedAt: string | null;
    mergedAt: string | null;
    isMerged: boolean;
    url: string;
    additions: number;
    deletions: number;
    changedFileCount: number;
};

export type GiteaPullRequestDiffDetail = {
    pullRequest: GiteaPullRequestDetailed;
    fileList: GiteaPullRequestFile[];
    rawDiff?: string | null;
    totalFileCount: number;
    isTruncated: boolean;
};

const BINARY_FILE_EXTENSIONS = new Set([
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".ico", ".bmp", ".tiff",
    ".pdf", ".zip", ".tar", ".gz", ".tgz", ".7z", ".rar",
    ".exe", ".dll", ".so", ".dylib", ".bin", ".iso", ".dmg",
    ".woff", ".woff2", ".ttf", ".eot", ".otf",
    ".mp3", ".wav", ".ogg", ".mp4", ".webm", ".avi", ".mov",
    ".pyc", ".class", ".jar", ".war"
]);

function isBinaryFile(filename: string, patch: string | null | undefined): boolean {
    if (patch) {
        if (
            patch.includes("Binary files differ") ||
            patch.includes("GIT binary patch") ||
            patch.includes("Binary file")
        ) {
            return true;
        }
    }
    const dotIndex = filename.lastIndexOf(".");
    if (dotIndex !== -1) {
        const ext = filename.slice(dotIndex).toLowerCase();
        if (BINARY_FILE_EXTENSIONS.has(ext)) {
            return true;
        }
    }
    return false;
}

type GiteaInlineReviewCommentDraft = {
    path: string;
    body: string;
    old_position: number;
    new_position: number;
};

export class GiteaProvider implements GitProvider {
    private reviewBuffer: GiteaInlineReviewCommentDraft[] = [];
    private reviewBufferPrIid: number | null = null;
    private reviewBufferCommitId: string | null = null;
    private reviewBufferSeq = 0;
    private flushedInlineCommentList: GitComment[] = [];

    constructor(
        private readonly baseUrl: string,
        private readonly token: string,
        private readonly owner = "",
        private readonly repo = "",
        private readonly repositoryId = 0,
    ) {}

    public async fetchCurrentUser(): Promise<GitUser> {
        const user = await this.requestJson<{
            login: string;
        }>("/user");
        return { username: user.login };
    }

    public async fetchUserDetail(): Promise<GiteaUser> {
        const raw = await this.requestJson<{
            id: number;
            login: string;
            full_name?: string;
            avatar_url?: string;
        }>("/user");

        return {
            id: raw.id,
            username: raw.login,
            fullName: raw.full_name?.trim() || raw.login,
            avatarUrl: raw.avatar_url ?? null,
        };
    }

    public async fetchOrganizationList(options?: { page?: number; limit?: number }): Promise<GiteaOrganization[]> {
        const page = options?.page ?? 1;
        const limit = options?.limit ?? 30;
        const rawList = await this.requestJson<
            Array<{
                id: number;
                username: string;
                full_name?: string;
                description?: string | null;
                avatar_url?: string;
            }>
        >(`/user/orgs?page=${page}&limit=${limit}`);

        return rawList.map((org) => ({
            id: org.id,
            username: org.username,
            fullName: org.full_name?.trim() || org.username,
            description: org.description ?? null,
            avatarUrl: org.avatar_url ?? null,
        }));
    }

    public async fetchPagedRepositoryList(options?: {
        org?: string;
        page?: number;
        limit?: number;
    }): Promise<PagedRepositoryResult> {
        const page = options?.page ?? 1;
        const limit = options?.limit ?? 20;
        const org = options?.org?.trim();

        const endpoint =
            org && org !== "personal"
                ? `/orgs/${encodeURIComponent(org)}/repos?page=${page}&limit=${limit}`
                : `/user/repos?page=${page}&limit=${limit}`;

        const { data, headers } = await this.requestWithHeader<
            Array<{
                id: number;
                name: string;
                full_name: string;
                owner: { login: string };
                description: string | null;
                private: boolean;
                html_url?: string;
                default_branch: string;
                permissions?: { admin?: boolean; push?: boolean; pull?: boolean };
            }>
        >(endpoint);

        const totalHeader = headers.get("x-total-count");
        const total = totalHeader ? parseInt(totalHeader, 10) : data.length;

        const repositoryList: GiteaRepository[] = data.map((repo) => ({
            id: repo.id,
            name: repo.name,
            fullName: repo.full_name,
            owner: repo.owner?.login ?? "",
            description: repo.description ?? null,
            url: repo.html_url ?? `${this.baseUrl.replace(/\/$/, "")}/${repo.full_name}`,
            isPrivate: Boolean(repo.private),
            defaultBranch: repo.default_branch || "main",
            canAccess: Boolean(repo.permissions?.push || repo.permissions?.admin || true),
        }));

        return {
            repositoryList,
            total: Number.isFinite(total) ? total : repositoryList.length,
            page,
            limit,
        };
    }

    public async fetchPagedPullRequestList(
        owner: string,
        repo: string,
        options?: {
            state?: "open" | "closed" | "merged" | "all";
            page?: number;
            limit?: number;
        },
    ): Promise<PagedPullRequestResult> {
        const page = options?.page ?? 1;
        const limit = options?.limit ?? 20;
        const requestedState = options?.state ?? "open";

        let apiState = "open";
        if (requestedState === "all") {
            apiState = "all";
        } else if (requestedState === "closed" || requestedState === "merged") {
            apiState = "closed";
        }

        const endpoint = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls?state=${apiState}&page=${page}&limit=${limit}`;
        const { data, headers } = await this.requestWithHeader<
            Array<{
                id: number;
                number: number;
                title: string;
                body: string | null;
                user: { login: string } | null;
                head: { ref: string };
                base: { ref: string };
                created_at: string;
                updated_at: string;
                state: string;
                merged: boolean;
                html_url?: string;
            }>
        >(endpoint);

        let filtered = data;
        if (requestedState === "merged") {
            filtered = data.filter((pr) => pr.merged);
        } else if (requestedState === "closed") {
            filtered = data.filter((pr) => !pr.merged && pr.state === "closed");
        }

        const totalHeader = headers.get("x-total-count");
        const total = totalHeader ? parseInt(totalHeader, 10) : data.length;

        const pullRequestList: GiteaPullRequest[] = filtered.map((pr) => ({
            id: pr.id,
            number: pr.number,
            title: pr.title,
            body: pr.body ?? null,
            author: pr.user?.login ?? "",
            sourceBranch: pr.head?.ref ?? "",
            targetBranch: pr.base?.ref ?? "",
            createdAt: pr.created_at,
            updatedAt: pr.updated_at,
            state: pr.merged ? "merged" : pr.state === "open" ? "open" : "closed",
            url: pr.html_url ?? "",
        }));

        return {
            pullRequestList,
            total: requestedState === "merged" || requestedState === "closed" ? pullRequestList.length : (Number.isFinite(total) ? total : pullRequestList.length),
            page,
            limit,
        };
    }

    public async fetchDetailedPullRequest(
        owner: string,
        repo: string,
        index: number,
    ): Promise<GiteaPullRequestDetailed> {
        const raw = await this.requestJson<{
            id: number;
            number: number;
            title: string;
            body: string | null;
            state: string;
            merged: boolean;
            created_at: string;
            updated_at: string;
            closed_at: string | null;
            merged_at: string | null;
            user: { login: string; avatar_url?: string } | null;
            base: { ref: string; sha: string; repo?: { name: string; owner?: { login: string } } } | null;
            head: { ref: string; sha: string; repo?: { name: string; owner?: { login: string } } } | null;
            html_url?: string;
            additions?: number;
            deletions?: number;
            changed_files?: number;
        }>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${index}`);

        const isMerged = Boolean(raw.merged);
        const state: "open" | "closed" | "merged" = isMerged
            ? "merged"
            : raw.state === "open"
              ? "open"
              : "closed";

        return {
            id: raw.id ?? index,
            number: raw.number ?? index,
            title: raw.title ?? "",
            body: raw.body ?? null,
            state,
            author: raw.user?.login ?? "",
            authorAvatarUrl: raw.user?.avatar_url ?? null,
            owner: raw.base?.repo?.owner?.login ?? owner,
            repo: raw.base?.repo?.name ?? repo,
            sourceBranch: raw.head?.ref ?? "",
            targetBranch: raw.base?.ref ?? "",
            headSha: raw.head?.sha ?? "",
            baseSha: raw.base?.sha ?? "",
            createdAt: raw.created_at ?? "",
            updatedAt: raw.updated_at ?? "",
            closedAt: raw.closed_at ?? null,
            mergedAt: raw.merged_at ?? null,
            isMerged,
            url: raw.html_url ?? "",
            additions: raw.additions ?? 0,
            deletions: raw.deletions ?? 0,
            changedFileCount: raw.changed_files ?? 0,
        };
    }

    public async fetchPullRequestFileList(
        owner: string,
        repo: string,
        index: number,
        options?: { page?: number; limit?: number },
    ): Promise<{ fileList: GiteaPullRequestFile[]; totalFileCount: number; isTruncated: boolean }> {
        const page = options?.page ?? 1;
        const limit = Math.min(options?.limit ?? 100, 100);

        const endpoint = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${index}/files?page=${page}&limit=${limit}`;
        const { data, headers } = await this.requestWithHeader<
            Array<{
                filename: string;
                previous_filename?: string | null;
                status: string;
                additions?: number;
                deletions?: number;
                changes?: number;
                html_url?: string;
                raw_url?: string;
                contents_url?: string;
                patch?: string | null;
            }>
        >(endpoint);

        const totalHeader = headers.get("x-total-count");
        const totalFileCount = totalHeader ? parseInt(totalHeader, 10) : data.length;
        const MAX_PATCH_LENGTH = 100_000;

        let hasTruncatedFile = false;
        const fileList: GiteaPullRequestFile[] = (Array.isArray(data) ? data : []).map((file) => {
            const rawPatch = file.patch ?? null;
            const isBinary = isBinaryFile(file.filename, rawPatch);

            let patch = rawPatch;
            let isTruncated = false;

            if (isBinary) {
                patch = null;
            } else if (rawPatch && rawPatch.length > MAX_PATCH_LENGTH) {
                patch = rawPatch.slice(0, MAX_PATCH_LENGTH) + "\n\n[Diff truncated: file diff exceeds maximum size limit]";
                isTruncated = true;
                hasTruncatedFile = true;
            }

            const additions = file.additions ?? 0;
            const deletions = file.deletions ?? 0;
            const changes = file.changes ?? additions + deletions;

            return {
                filename: file.filename,
                previousFilename: file.previous_filename ?? null,
                status: file.status || "modified",
                additions,
                deletions,
                changes,
                patch,
                isBinary,
                isTruncated,
                rawUrl: file.raw_url ?? null,
            };
        });

        return {
            fileList,
            totalFileCount: Number.isFinite(totalFileCount) ? totalFileCount : fileList.length,
            isTruncated: hasTruncatedFile || (Number.isFinite(totalFileCount) && totalFileCount > fileList.length),
        };
    }

    public async fetchPullRequestRawDiff(
        owner: string,
        repo: string,
        index: number,
    ): Promise<string> {
        const url = new URL(
            `/api/v1/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${index}.diff`,
            this.baseUrl,
        );
        const response = await fetch(url, {
            headers: {
                Authorization: `token ${this.token}`,
                Accept: "text/plain",
            },
            signal: AbortSignal.timeout(15000),
        });

        if (!response.ok) {
            log(`raw diff request failed ${response.status}`, "Gitea");
            const error = new Error(`Gitea diff request failed: ${response.status}`);
            (error as Error & { status: number }).status = response.status;
            throw error;
        }

        const MAX_DIFF_BYTES = 2 * 1024 * 1024;
        const text = await response.text();
        if (text.length > MAX_DIFF_BYTES) {
            return text.slice(0, MAX_DIFF_BYTES) + "\n\n[Diff truncated: exceeded 2MB limit]";
        }
        return text;
    }

    public async fetchPullRequestDiffDetail(
        owner: string,
        repo: string,
        index: number,
    ): Promise<GiteaPullRequestDiffDetail> {
        const [pullRequest, { fileList, totalFileCount, isTruncated }] = await Promise.all([
            this.fetchDetailedPullRequest(owner, repo, index),
            this.fetchPullRequestFileList(owner, repo, index),
        ]);

        return {
            pullRequest,
            fileList,
            totalFileCount,
            isTruncated,
        };
    }

    public async isConnectedAccountCollaborator(): Promise<boolean> {
        const user = await this.fetchCurrentUser();
        const level = await this.fetchUserPermission({ login: user.username });
        return level > 0;
    }

    public async fetchUserPermission(identity: GitUserPermissionIdentity): Promise<number> {
        if (!("login" in identity) || !identity.login) {
            throw new Error("Gitea fetchUserPermission requires login");
        }

        try {
            const result = await this.requestJson<{
                permission?: string;
                role_name?: string;
            }>(`/repos/${this.owner}/${this.repo}/collaborators/${identity.login}/permission`);
            if (result.role_name === "owner") return 5;
            return giteaPermissionToLevel(result.permission ?? "none");
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
                throw new Error("Gitea repository path is missing");
            }
            return path;
        }
        const repository = await this.requestJson<{ full_name: string }>(`/repos/${this.owner}/${this.repo}`);
        const path = repository.full_name?.trim();
        if (!path) {
            throw new Error("Gitea repository path is missing");
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

    private async fetchRepositoryLabelRecordList(): Promise<
        Array<{ id: number; name: string; description?: string }>
    > {
        const labelList: Array<{ id: number; name: string; description?: string }> = [];
        for (let page = 1; ; page++) {
            const pageList = await this.requestJson<Array<{ id: number; name: string; description?: string }>>(
                `/repos/${this.owner}/${this.repo}/labels?limit=50&page=${page}`,
            );
            labelList.push(...pageList);
            if (pageList.length < 50) break;
        }
        return labelList;
    }

    public async fetchRepositoryLabelList(): Promise<GitRepositoryLabel[]> {
        const labelList = await this.fetchRepositoryLabelRecordList();
        return labelList.map((label) => ({
            name: label.name,
            description: label.description?.trim() ? label.description : null,
        }));
    }

    public async addIssueLabel(issueIid: number, label: string): Promise<void> {
        const labelList = await this.fetchRepositoryLabelRecordList();
        const match = labelList.find((item) => item.name === label);
        if (!match) {
            throw new Error(`Unknown label: ${label}`);
        }
        await this.requestJson(`/repos/${this.owner}/${this.repo}/issues/${issueIid}/labels`, {
            method: "POST",
            body: JSON.stringify({ labels: [match.id] }),
        });
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
        return await this.submitPullRequestReview(prIid, body);
    }

    public takeFlushedInlineCommentList(): GitComment[] {
        const commentList = this.flushedInlineCommentList;
        this.flushedInlineCommentList = [];
        return commentList;
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
            throw new Error(`Gitea inline review comment not found: ${commentId}`);
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
            throw new Error(`Gitea inline review comment not found: ${rootId}`);
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
            throw new Error("Gitea inline comment requires newLine or oldLine in position");
        }
        const filePath = newPos === 0 && oldPos > 0 && position.oldPath ? position.oldPath : position.newPath;
        const existingIndex = this.reviewBuffer.findIndex(
            (item) =>
                item.path === filePath &&
                item.body === body &&
                item.old_position === oldPos &&
                item.new_position === newPos,
        );
        if (existingIndex === -1) {
            this.reviewBuffer.push({
                path: filePath,
                body,
                old_position: oldPos,
                new_position: newPos,
            });
            this.reviewBufferSeq += 1;
        }

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
        if (!this.reviewBufferCommitId) {
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
            throw new Error("Gitea multiline comment requires a resolvable end line on old or new side");
        }

        const filePath = newPos === 0 && oldPos > 0 && position.oldPath ? position.oldPath : position.newPath;
        const existingIndex = this.reviewBuffer.findIndex(
            (item) =>
                item.path === filePath &&
                item.body === text &&
                item.old_position === oldPos &&
                item.new_position === newPos,
        );
        if (existingIndex === -1) {
            this.reviewBuffer.push({
                path: filePath,
                body: text,
                old_position: oldPos,
                new_position: newPos,
            });
            this.reviewBufferSeq += 1;
        }

        return {
            id: -this.reviewBufferSeq,
            body,
            author: "",
            createdAt: new Date().toISOString(),
        };
    }

    public async addEmoji(target: GitEmojiTarget, emoji: GitEmoji): Promise<void> {
        const content = emojiList[emoji]?.forgejo;
        if (!content) return;

        let path: string;
        switch (target.type) {
            case "pull_request":
                path = `/repos/${this.owner}/${this.repo}/issues/${target.prIid}/reactions`;
                break;
            case "issue":
                path = `/repos/${this.owner}/${this.repo}/issues/${target.issueIid}/reactions`;
                break;
            case "pull_request_comment":
            case "issue_comment":
            case "inline_review_comment":
                path = `/repos/${this.owner}/${this.repo}/issues/comments/${target.commentId}/reactions`;
                break;
        }

        try {
            await this.requestJson(path, {
                method: "POST",
                body: JSON.stringify({ content }),
            });
        } catch (error) {
            const status = (error as { status?: number }).status;
            if (status === 404 || status === 422) return;
            throw error;
        }
    }

    public async removeEmoji(target: GitEmojiTarget, emoji: GitEmoji): Promise<void> {
        const content = emojiList[emoji]?.forgejo;
        if (!content) return;

        let path: string;
        switch (target.type) {
            case "pull_request":
                path = `/repos/${this.owner}/${this.repo}/issues/${target.prIid}/reactions`;
                break;
            case "issue":
                path = `/repos/${this.owner}/${this.repo}/issues/${target.issueIid}/reactions`;
                break;
            case "pull_request_comment":
            case "issue_comment":
            case "inline_review_comment":
                path = `/repos/${this.owner}/${this.repo}/issues/comments/${target.commentId}/reactions`;
                break;
        }

        try {
            await this.requestJson(path, {
                method: "DELETE",
                body: JSON.stringify({ content }),
            });
        } catch (error) {
            const status = (error as { status?: number }).status;
            if (status === 404 || status === 422) return;
            throw error;
        }
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
        type RawGiteaRepo = {
            id: number;
            name: string;
            full_name: string;
            description: string | null;
            default_branch: string;
        };

        const repoList: RawGiteaRepo[] = [];
        for (let page = 1; ; page++) {
            const pageList = await this.requestJson<RawGiteaRepo[]>(`/user/repos?page=${page}&limit=50`);
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

    private async submitPullRequestReview(prIid: number, summaryBody: string = ""): Promise<GitComment> {
        this.flushedInlineCommentList = [];
        if (summaryBody === "" && this.reviewBuffer.length === 0) {
            return {
                id: 0,
                body: "",
                author: "",
                createdAt: new Date().toISOString(),
            };
        }

        if (this.reviewBufferPrIid !== null && this.reviewBufferPrIid !== prIid) {
            this.reviewBuffer = [];
            this.reviewBufferPrIid = null;
            this.reviewBufferCommitId = null;
            this.reviewBufferSeq = 0;
            if (summaryBody === "") {
                return {
                    id: 0,
                    body: "",
                    author: "",
                    createdAt: new Date().toISOString(),
                };
            }
        }

        let commitId = this.reviewBufferCommitId;
        if (!commitId) {
            try {
                commitId = (await this.fetchPullRequestVersion(prIid)).headSha;
                if (this.reviewBuffer.length > 0) {
                    this.reviewBufferCommitId = commitId;
                }
            } catch (error) {
                if (this.reviewBuffer.length > 0) {
                    throw error;
                }
                commitId = "";
            }
        }

        const commentDraftList = this.reviewBuffer.map((c) => ({
            path: c.path,
            body: c.body,
            old_position: c.old_position,
            new_position: c.new_position,
        }));
        const expectedCount = commentDraftList.length;

        const reviewPayload: Record<string, unknown> = {
            event: "COMMENT",
            body: summaryBody,
            comments: commentDraftList,
        };
        if (commitId) {
            reviewPayload.commit_id = commitId;
        }

        const review = await this.requestJson<{
            id: number;
            body?: string;
            user?: { login: string } | null;
            submitted_at?: string;
        }>(`/repos/${this.owner}/${this.repo}/pulls/${prIid}/reviews`, {
            method: "POST",
            body: JSON.stringify(reviewPayload),
        });

        this.reviewBuffer = [];
        this.reviewBufferPrIid = null;
        this.reviewBufferCommitId = null;
        this.reviewBufferSeq = 0;

        if (expectedCount > 0) {
            try {
                const commentList = await this.requestJson<
                    Array<{
                        id: number;
                        body: string;
                        user: { login: string } | null;
                        created_at: string;
                    }>
                >(`/repos/${this.owner}/${this.repo}/pulls/${prIid}/reviews/${review.id}/comments`);

                if (Array.isArray(commentList)) {
                    this.flushedInlineCommentList = commentList.map((comment) => ({
                        id: comment.id,
                        body: comment.body,
                        author: comment.user?.login ?? "",
                        createdAt: comment.created_at,
                    }));
                }
            } catch {
                log("Failed to fetch published inline review comments from Gitea", "Gitea");
            }
        }

        return {
            id: review.id,
            body: review.body ?? summaryBody,
            author: review.user?.login ?? "",
            createdAt: review.submitted_at ?? new Date().toISOString(),
        };
    }

    private async requestJson<T>(path: string, init?: RequestInit): Promise<T> {
        const result = await this.requestWithHeader<T>(path, init);
        return result.data;
    }

    private async requestWithHeader<T>(path: string, init?: RequestInit): Promise<{ data: T; headers: Headers }> {
        const url = new URL(`/api/v1${path}`, this.baseUrl);
        const response = await fetch(url, {
            ...init,
            signal: init?.signal ?? AbortSignal.timeout(15000),
            headers: {
                "Content-Type": "application/json",
                Authorization: `token ${this.token}`,
                ...(init?.headers ?? {}),
            },
        });

        if (!response.ok) {
            const raw = (await response.text()).trim();
            const base = `${response.status} ${response.statusText}`.trim();
            let suffix = base;
            if (raw) {
                try {
                    const body = JSON.parse(raw) as { message?: string };
                    if (typeof body.message === "string" && body.message.trim() && body.message.trim() !== base) {
                        suffix = `${base} (${body.message.trim()})`;
                    }
                } catch {
                    if (raw !== base && raw !== String(response.status)) {
                        const snippet = raw.length > 300 ? `${raw.slice(0, 300)}…` : raw;
                        suffix = `${base} (${snippet})`;
                    }
                }
            }
            log(`request failed ${response.status} ${path}`, "Gitea");
            const error = new Error(`Gitea request failed ${path}: ${suffix}`);
            (error as Error & { status: number }).status = response.status;
            throw error;
        }

        const contentLength = response.headers.get("content-length");
        if (contentLength === "0" || response.status === 204) {
            return { data: {} as T, headers: response.headers };
        }

        const data = (await response.json()) as T;
        return { data, headers: response.headers };
    }
}

function giteaPermissionToLevel(permission: string): number {
    const giteaPermissionToLevelMap: Record<string, number> = {
        none: 0,
        read: 1,
        write: 3,
        admin: 4,
        owner: 5,
    };
    return giteaPermissionToLevelMap[permission] ?? 0;
}
