import type { ToolSet } from "ai";
import { ReviewBase } from "../review/review.base.js";
import {
    approvalPromptAddendum,
    buildReviewPolicyAppendix,
    reviewPrompt,
    replyPrompt,
} from "./merge-request.prompt.js";
import {
    approveMergeRequestTool,
    getDirectoryTreeTool,
    getFileContentTool,
    getMergeRequestCommentListTool,
    getMergeRequestDetailTool,
    postMergeRequestCommentTool,
    postMergeRequestReplyTool,
    getMergeRequestDiffTool,
    getMergeRequestVersionTool,
    createSingleLineCommentTool,
    unapproveMergeRequestTool,
    createMultiLineCommentTool,
} from "./merge-request.tool.js";

export class MergeRequestService extends ReviewBase {
    private readonly reviewOnMergeRequestOpen: boolean;
    private readonly inlineReview: boolean;
    private readonly replyToMergeRequestComment: "all" | "mentioned_only" | "off";

    constructor(
        provider: ConstructorParameters<typeof ReviewBase>[0],
        modelBaseUrl: string,
        modelApiKey: string,
        modelName: string,
        language: string,
        reviewOnMergeRequestOpen: boolean,
        inlineReview: boolean,
        replyToMergeRequestComment: "all" | "mentioned_only" | "off",
    ) {
        super(provider, modelBaseUrl, modelApiKey, modelName, language);
        this.reviewOnMergeRequestOpen = reviewOnMergeRequestOpen;
        this.inlineReview = inlineReview;
        this.replyToMergeRequestComment = replyToMergeRequestComment;
    }

    public async review(mrIid: number): Promise<void> {
        const detail = await this.provider.fetchMergeRequestDetail(mrIid);
        const { targetBranch, sourceBranch } = detail;

        const system = `${reviewPrompt}\n\n${buildReviewPolicyAppendix({ inlineReview: this.inlineReview })}`;

        // generate options for agent
        const stats = await this.run({
            system,
            prompt: `Merge request IID: ${mrIid}. Target branch: ${targetBranch}. Source branch for file reads: ${sourceBranch}. Use the available tools in order, then finish with a single top-level summary. Language: ${this.language}`,
            tools: this.createReviewToolList(mrIid, sourceBranch),
        });

        console.log(
            `[MR review] iid=${mrIid} steps=${stats.stepCount} inlineReview=${this.inlineReview} tools=${JSON.stringify(stats.toolCallCounts)}`,
        );
    }

    public async reply(mrIid: number, commenterUsername: string, commentBody: string): Promise<void> {
        const detail = await this.provider.fetchMergeRequestDetail(mrIid);
        const fileRef = detail.sourceBranch;

        const stats = await this.run({
            system: replyPrompt,
            prompt: `Merge request IID: ${mrIid}. Source branch for file reads: ${fileRef}. User @${commenterUsername} mentioned you. Their comment:\n\n${commentBody}\n\nUse the available tools if needed, then post your reply. Language: ${this.language}`,
            tools: this.createReplyToolList(mrIid, commenterUsername, fileRef),
            maxSteps: 14,
        });

        console.log(`[MR reply] iid=${mrIid} steps=${stats.stepCount} tools=${JSON.stringify(stats.toolCallCounts)}`);
    }

    private createReviewToolList(mrIid: number, fileRef: string) {
        const base: Record<string, unknown> = {
            get_merge_request_detail: getMergeRequestDetailTool(this.provider, mrIid),
            get_merge_request_diff: getMergeRequestDiffTool(this.provider, mrIid),
            get_merge_request_comment_list: getMergeRequestCommentListTool(this.provider, mrIid),
            get_directory_tree: getDirectoryTreeTool(this.provider, fileRef),
            get_file_content: getFileContentTool(this.provider, fileRef),
            post_merge_request_comment: postMergeRequestCommentTool(this.provider, mrIid),
            get_merge_request_version: getMergeRequestVersionTool(this.provider, mrIid),
        };

        if (this.inlineReview) {
            base.create_single_line_comment = createSingleLineCommentTool(this.provider, mrIid);
            base.create_multi_line_comment = createMultiLineCommentTool(this.provider, mrIid);
        }

        return {
            ...base,
            approve_merge_request: approveMergeRequestTool(this.provider, mrIid),
            unapprove_merge_request: unapproveMergeRequestTool(this.provider, mrIid),
        } as ToolSet;
    }

    private createReplyToolList(mrIid: number, commenterUsername: string, fileRef: string): ToolSet {
        const base = {
            get_merge_request_detail: getMergeRequestDetailTool(this.provider, mrIid),
            get_merge_request_diff: getMergeRequestDiffTool(this.provider, mrIid),
            get_merge_request_comment_list: getMergeRequestCommentListTool(this.provider, mrIid),
            get_directory_tree: getDirectoryTreeTool(this.provider, fileRef),
            get_file_content: getFileContentTool(this.provider, fileRef),
            post_reply_comment: postMergeRequestReplyTool(this.provider, mrIid, commenterUsername),
            get_merge_request_version: getMergeRequestVersionTool(this.provider, mrIid),
        };
        return base as ToolSet;
    }
}
