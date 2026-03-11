import { Gitlab } from "@gitbeaker/rest";
import type { GitComment, GitDiff, GitMergeRequest, GitMergeRequestState, GitProvider, GitTree } from "./types.js";

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

    public async fetchDirectoryTree(filePath: string, recursive?: boolean): Promise<GitTree[]> {
        const tree = await this.gitlab.Repositories.allRepositoryTrees(this.projectId, { path: filePath, recursive });
        return tree;
    }

    public async fetchFileContent(filePath: string): Promise<string> {
        const response = await this.gitlab.RepositoryFiles.show(this.projectId, filePath, "main");
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
}
