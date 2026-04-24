import type { ToolSet } from "ai";
import { ReviewBase } from "../review/review.base.js";
import { approvalPromptAddendum, buildReviewPolicyAppendix, reviewPrompt, replyPrompt } from "./merge-request.prompt.js";
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
} from "./merge-request.tool.js";

export class MergeRequestService extends ReviewBase {
    private readonly inlineReviewMode: "off" | "important_only" | "balanced";
    private readonly reviewDepth: "standard" | "deep";

    constructor(
        provider: ConstructorParameters<typeof ReviewBase>[0],
        modelBaseUrl: string,
        modelApiKey: string,
        modelName: string,
        language: string,
        allowApproval: boolean,
        inlineReviewMode: "off" | "important_only" | "balanced",
        reviewDepth: "standard" | "deep",
    ) {
        super(provider, modelBaseUrl, modelApiKey, modelName, language, allowApproval);
        this.inlineReviewMode = inlineReviewMode;
        this.reviewDepth = reviewDepth;
    }

    private computeMaxSteps(): number {
        let n = this.reviewDepth === "deep" ? 42 : 30;
        if (this.allowApproval) n += 6;
        if (this.inlineReviewMode !== "off") n += 6;
        return n;
    }

    private inlineMax(): number {
        switch (this.inlineReviewMode) {
            case "off":
                return 0;
            case "important_only":
                return 5;
            case "balanced":
                return 8;
            default:
                return 5;
        }
    }

    public async review(mrIid: number): Promise<void> {
        const detail = await this.provider.fetchMergeRequestDetail(mrIid);
        const fileRef = detail.sourceBranch;

        const policy = buildReviewPolicyAppendix({
            inlineReviewMode: this.inlineReviewMode,
            reviewDepth: this.reviewDepth,
        });
        const system = `${reviewPrompt}\n\n${policy}${this.allowApproval ? `\n\n${approvalPromptAddendum}` : ""}`;

        const stats = await this.run({
            system,
            prompt: `Merge request IID: ${mrIid}. Source branch for file reads: ${fileRef}. Use the available tools in order, then finish with a single top-level summary. Language: ${this.language}`,
            tools: this.createReviewToolList(mrIid, fileRef),
            maxSteps: this.computeMaxSteps(),
        });

        console.log(
            `[MR review] iid=${mrIid} steps=${stats.stepCount} inlineReviewMode=${this.inlineReviewMode} depth=${this.reviewDepth} tools=${JSON.stringify(stats.toolCallCounts)}`,
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
            get_directory_tree: getDirectoryTreeTool(this.provider),
            get_file_content: getFileContentTool(this.provider, fileRef),
            post_merge_request_comment: postMergeRequestCommentTool(this.provider, mrIid),
            get_merge_request_version: getMergeRequestVersionTool(this.provider, mrIid),
        };

        if (this.inlineReviewMode !== "off") {
            base.create_single_line_comment = createSingleLineCommentTool(this.provider, mrIid, {
                max: this.inlineMax(),
            });
        }

        if (!this.allowApproval) {
            return base as ToolSet;
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
            get_directory_tree: getDirectoryTreeTool(this.provider),
            get_file_content: getFileContentTool(this.provider, fileRef),
            post_reply_comment: postMergeRequestReplyTool(this.provider, mrIid, commenterUsername),
            get_merge_request_version: getMergeRequestVersionTool(this.provider, mrIid),
            create_single_line_comment: createSingleLineCommentTool(this.provider, mrIid, { max: 5 }),
        };
        return base as ToolSet;
    }
}
