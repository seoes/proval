import { ReviewBase } from "../review/review.base.js";
import { approvalPromptAddendum, reviewPrompt, replyPrompt } from "./merge-request.prompt.js";
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
    // createMultiLineCommentTool,
} from "./merge-request.tool.js";

export class MergeRequestService extends ReviewBase {
    public async review(mrIid: number): Promise<void> {
        const system = this.allowApproval ? `${reviewPrompt}\n\n${approvalPromptAddendum}` : reviewPrompt;
        await this.run({
            system,
            prompt: `Use the available tools to gather information, then submit your review. Language: ${this.language}`,
            tools: this.createReviewToolList(mrIid),
            maxSteps: this.allowApproval ? 20 : undefined,
        });
    }

    public async reply(mrIid: number, commenterUsername: string, commentBody: string): Promise<void> {
        await this.run({
            system: replyPrompt,
            prompt: `User @${commenterUsername} mentioned you. Their comment:\n\n${commentBody}\n\nUse the available tools to gather context if needed, then post your reply. Language: ${this.language}`,
            tools: this.createReplyToolList(mrIid, commenterUsername),
            maxSteps: 10,
        });
    }

    private createReviewToolList(mrIid: number) {
        const base = {
            get_merge_request_detail: getMergeRequestDetailTool(this.provider, mrIid),
            get_merge_request_diff: getMergeRequestDiffTool(this.provider, mrIid),
            get_merge_request_comment_list: getMergeRequestCommentListTool(this.provider, mrIid),
            get_directory_tree: getDirectoryTreeTool(this.provider),
            get_file_content: getFileContentTool(this.provider),
            post_merge_request_comment: postMergeRequestCommentTool(this.provider, mrIid),
            get_merge_request_version: getMergeRequestVersionTool(this.provider, mrIid),
            create_single_line_comment: createSingleLineCommentTool(this.provider, mrIid),
            // create_multi_line_comment: createMultiLineCommentTool(this.provider, mrIid),
        };
        if (!this.allowApproval) {
            return base;
        }
        return {
            ...base,
            approve_merge_request: approveMergeRequestTool(this.provider, mrIid),
            unapprove_merge_request: unapproveMergeRequestTool(this.provider, mrIid),
        };
    }

    private createReplyToolList(mrIid: number, commenterUsername: string) {
        return {
            get_merge_request_detail: getMergeRequestDetailTool(this.provider, mrIid),
            get_merge_request_diff: getMergeRequestDiffTool(this.provider, mrIid),
            get_merge_request_comment_list: getMergeRequestCommentListTool(this.provider, mrIid),
            get_directory_tree: getDirectoryTreeTool(this.provider),
            get_file_content: getFileContentTool(this.provider),
            post_reply_comment: postMergeRequestReplyTool(this.provider, mrIid, commenterUsername),
            get_merge_request_version: getMergeRequestVersionTool(this.provider, mrIid),
            create_single_line_comment: createSingleLineCommentTool(this.provider, mrIid),
            // create_multi_line_comment: createMultiLineCommentTool(this.provider, mrIid),
        };
    }
}
