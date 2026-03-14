import { ReviewBase } from "../review/review.base.js";
import { reviewPrompt, replyPrompt } from "./merge-request.prompt.js";
import {
    getDirectoryTreeTool,
    getFileContentTool,
    getMergeRequestCommentListTool,
    getMergeRequestDetailTool,
    postMergeRequestCommentTool,
    postMergeRequestReplyTool,
    getMergeRequestDiffTool,
} from "./merge-request.tool.js";

export class MergeRequestService extends ReviewBase {
    public async review(mrIid: number): Promise<void> {
        await this.run({
            system: reviewPrompt,
            prompt: `Review merge request !${mrIid}. Use the available tools to gather information, then submit your review. Language: ${this.language}`,
            tools: this.createReviewToolList(mrIid),
        });
    }

    public async reply(mrIid: number, commenterUsername: string, commentBody: string): Promise<void> {
        await this.run({
            system: replyPrompt,
            prompt: `User @${commenterUsername} mentioned you in merge request !${mrIid}. Their comment:\n\n${commentBody}\n\nUse the available tools to gather context if needed, then post your reply. Language: ${this.language}`,
            tools: this.createReplyToolList(mrIid, commenterUsername),
            maxSteps: 10,
        });
    }

    private createReviewToolList(mrIid: number) {
        return {
            get_merge_request_detail: getMergeRequestDetailTool(this.provider, mrIid),
            get_merge_request_diff: getMergeRequestDiffTool(this.provider, mrIid),
            get_merge_request_comment_list: getMergeRequestCommentListTool(this.provider, mrIid),
            get_directory_tree: getDirectoryTreeTool(this.provider),
            get_file_content: getFileContentTool(this.provider),
            post_merge_request_comment: postMergeRequestCommentTool(this.provider, mrIid),
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
        };
    }
}
