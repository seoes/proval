import { Gitlab, type MergeRequestReviewerSchema } from "@gitbeaker/rest";
import type {
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

export class GitLabProvider implements GitProvider {
    private readonly gitlab: Gitlab;
    constructor(
        baseUrl: string,
        token: string,
        private readonly projectId: number,
    ) {
        this.gitlab = new Gitlab({
            host: baseUrl,
            token: token,
        });
    }

    public async fetchRepositoryDetail() {
        const repository = await this.gitlab.Projects.show(this.projectId);
        return {
            id: repository.id,
            name: repository.name,
            description: repository.description,
        };
    }

    public async fetchMergeRequestDetail(mrIid: number): Promise<GitMergeRequest> {
        const mergeRequest = await this.gitlab.MergeRequests.show(this.projectId, mrIid);
        return {
            title: mergeRequest.title,
            description: mergeRequest.description,
            sourceBranch: mergeRequest.source_branch,
            targetBranch: mergeRequest.target_branch,
            author: mergeRequest.author.username,
            state: mergeRequest.state as GitMergeRequestState,
        };
    }

    public async fetchMergeRequestDiff(mrIid: number): Promise<GitDiff[]> {
        const changes = await this.gitlab.MergeRequests.allDiffs(this.projectId, mrIid);
        return changes.map((change) => ({
            oldPath: change.old_path,
            newPath: change.new_path,
            newFile: change.new_file,
            renamedFile: change.renamed_file,
            deletedFile: change.deleted_file,
            diff: change.diff,
        }));
    }

    public async fetchMergeRequestCommentList(mrIid: number): Promise<GitComment[]> {
        const comments = await this.gitlab.MergeRequestNotes.all(this.projectId, mrIid);
        return comments.map((comment) => ({
            id: comment.id,
            body: comment.body,
            author: comment.author.username,
            createdAt: comment.created_at,
        }));
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
        const branchOrSha = ref ?? "main";
        const response = await this.gitlab.RepositoryFiles.show(this.projectId, filePath, branchOrSha);
        return response.content;
    }

    public async createMergeRequestComment(mrIid: number, body: string): Promise<GitComment> {
        const comment = await this.gitlab.MergeRequestNotes.create(this.projectId, mrIid, body);
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

    public async fetchMergeRequestReviewerList(mrIid: number): Promise<string[]> {
        const mr = await this.gitlab.MergeRequests.show(this.projectId, mrIid);
        return (mr.reviewers ?? []).map((r: { username: string }) => r.username);
    }

    public async fetchMergeRequestVersion(mrIid: number): Promise<GitMergeRequestVersion> {
        const versions = await this.gitlab.MergeRequests.allDiffVersions(this.projectId, mrIid);
        const latest = versions[0];
        return {
            headSha: latest.head_commit_sha,
            baseSha: latest.base_commit_sha,
            startSha: latest.start_commit_sha,
        };
    }

    public async createCommentToSingleLine(
        mrIid: number,
        body: string,
        position: GitDiffSingleLine,
    ): Promise<GitComment> {
        const discussion = await this.gitlab.MergeRequestDiscussions.create(this.projectId, mrIid, body, {
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
        mrIid: number,
        body: string,
        position: GitDiffMultiLine,
    ): Promise<GitComment> {
        // GitLab expects the "anchor" new_line/old_line to be the last line of the selected range.
        const anchorNewLine = position.end.type === "new" ? position.end.newLine : undefined;
        const anchorOldLine = position.end.type === "old" ? position.end.oldLine : undefined;

        const discussion = await this.gitlab.MergeRequestDiscussions.create(this.projectId, mrIid, body, {
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
                        ...(position.start.newLine !== undefined && { newLine: position.start.newLine }),
                        ...(position.start.oldLine !== undefined && { oldLine: position.start.oldLine }),
                    },
                    end: {
                        type: position.end.type,
                        ...(position.end.newLine !== undefined && { newLine: position.end.newLine }),
                        ...(position.end.oldLine !== undefined && { oldLine: position.end.oldLine }),
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

    public async approveMergeRequest(mrIid: number): Promise<void> {
        await this.gitlab.MergeRequestApprovals.approve(this.projectId, mrIid);
    }

    public async unapproveMergeRequest(mrIid: number): Promise<void> {
        await this.gitlab.MergeRequestApprovals.unapprove(this.projectId, mrIid);
    }

    public async assignMergeRequestReviewer(mrIid: number): Promise<void> {
        console.log("assignMergeRequestReviewer", mrIid);
        const user = await this.gitlab.Users.showCurrentUser();
        console.log("user", user);
        const reviewerList = await this.gitlab.MergeRequests.showReviewers(this.projectId, mrIid);
        console.log("reviewerList", reviewerList);
        await this.gitlab.MergeRequests.edit(this.projectId, mrIid, {
            reviewerIds: [...reviewerList.map((r: MergeRequestReviewerSchema) => r.user.id), user.id],
        });
        console.log("assigned");
    }
}
