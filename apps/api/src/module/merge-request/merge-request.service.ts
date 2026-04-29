import { runAgentLoop, type AgentTool } from "../../agent/loop.js";
import { createOpenAiSender } from "../../agent/openai.js";
import {
    getMergeRequestDetailTool,
    getMergeRequestDiffTool,
    getMergeRequestCommentListTool,
    getDirectoryTreeTool,
    getFileContentTool,
    postMergeRequestCommentTool,
    postMergeRequestReplyTool,
    getMergeRequestVersionTool,
    createSingleLineCommentTool,
    createMultiLineCommentTool,
    approveMergeRequestTool,
    unapproveMergeRequestTool,
} from "../../agent/tool/index.js";
import {
    buildReviewPolicyAppendix,
    reviewPrompt,
    replyPrompt,
} from "./merge-request.prompt.js";
import type { GitProvider } from "../../provider/types.js";

export class MergeRequestService {
    private readonly sender: ReturnType<typeof createOpenAiSender>;

    constructor(
        private readonly provider: GitProvider,
        modelBaseUrl: string,
        modelApiKey: string,
        modelName: string,
        private readonly language: string,
        reviewOnMergeRequestOpen: boolean,
        private readonly inlineReview: boolean,
        replyToMergeRequestComment: "all" | "mentioned_only" | "off",
    ) {
        this.sender = createOpenAiSender({
            apiKey: modelApiKey,
            baseURL: modelBaseUrl,
            model: modelName,
        });
    }

    public async review(mrIid: number): Promise<void> {
        const detail = await this.provider.fetchMergeRequestDetail(mrIid);
        const { targetBranch, sourceBranch } = detail;

        const system = `${reviewPrompt}\n\n${buildReviewPolicyAppendix({ inlineReview: this.inlineReview })}`;

        const stats = await runAgentLoop(
            this.sender,
            system,
            `Merge request IID: ${mrIid}. Target branch: ${targetBranch}. Source branch for file reads: ${sourceBranch}. Use the available tools in order, then finish with a single top-level summary. Language: ${this.language}`,
            this.createReviewToolList(mrIid, sourceBranch),
        );

        console.log(
            `[MR review] iid=${mrIid} steps=${stats.stepCount} inlineReview=${this.inlineReview} tools=${JSON.stringify(stats.toolCallCounts)}`,
        );
    }

    public async reply(mrIid: number, commenterUsername: string, commentBody: string): Promise<void> {
        const detail = await this.provider.fetchMergeRequestDetail(mrIid);
        const fileRef = detail.sourceBranch;

        const stats = await runAgentLoop(
            this.sender,
            replyPrompt,
            `Merge request IID: ${mrIid}. Source branch for file reads: ${fileRef}. User @${commenterUsername} mentioned you. Their comment:\n\n${commentBody}\n\nUse the available tools if needed, then post your reply. Language: ${this.language}`,
            this.createReplyToolList(mrIid, commenterUsername, fileRef),
            14,
        );

        console.log(`[MR reply] iid=${mrIid} steps=${stats.stepCount} tools=${JSON.stringify(stats.toolCallCounts)}`);
    }

    private createReviewToolList(mrIid: number, fileRef: string): Record<string, AgentTool> {
        const base: Record<string, AgentTool> = {
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
        };
    }

    private createReplyToolList(mrIid: number, commenterUsername: string, fileRef: string): Record<string, AgentTool> {
        return {
            get_merge_request_detail: getMergeRequestDetailTool(this.provider, mrIid),
            get_merge_request_diff: getMergeRequestDiffTool(this.provider, mrIid),
            get_merge_request_comment_list: getMergeRequestCommentListTool(this.provider, mrIid),
            get_directory_tree: getDirectoryTreeTool(this.provider, fileRef),
            get_file_content: getFileContentTool(this.provider, fileRef),
            post_reply_comment: postMergeRequestReplyTool(this.provider, mrIid, commenterUsername),
            get_merge_request_version: getMergeRequestVersionTool(this.provider, mrIid),
        };
    }
}
