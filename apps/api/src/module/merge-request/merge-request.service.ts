import { runAgentLoop, type AgentTool } from "../../agent/loop.js";
import { createOpenAiSender } from "../../agent/openai.js";
import {
    getChangedFileListTool,
    getMergeRequestDetailTool,
    getFileDiffTool,
    getMergeRequestCommentListTool,
    getDirectoryTreeTool,
    getFileContentTool,
    searchCodeListTool,
    searchLineByKeywordTool,
    postMergeRequestCommentTool,
    postMergeRequestReplyTool,
    getMergeRequestVersionTool,
    createSingleLineCommentTool,
    createMultiLineCommentTool,
    approveMergeRequestTool,
    unapproveMergeRequestTool,
    appendReviewTargetTool,
} from "../../agent/tool/index.js";
import type { GitProvider } from "../../provider/types.js";
import type { ReviewTarget } from "./review-target.schema.js";
import {
    DEEP_REVIEW_PLAN_PROMPT,
    DEEP_REVIEW_SUB_AGENT_PROMPT,
    DEEP_REVIEW_COMMENT_PROMPT,
    REPLY_PROMPT,
    STANDARD_REVIEW_PROMPT,
} from "./prompt/index.js";

export type { ReviewTarget } from "./review-target.schema.js";

export class MergeRequestService {
    private readonly sender: ReturnType<typeof createOpenAiSender>;

    constructor(
        private readonly provider: GitProvider,
        modelBaseUrl: string,
        modelApiKey: string,
        modelName: string,
        private readonly language: string,
        private readonly inlineReview: boolean,
    ) {
        this.sender = createOpenAiSender({
            apiKey: modelApiKey,
            baseURL: modelBaseUrl,
            model: modelName,
        });
    }

    // #########################################################
    // # Standard Review
    // #########################################################

    public async generateStandardReview(mrIid: number): Promise<void> {
        const inlineModeTag = this.inlineReview
            ? "<inline_comments_enabled>true</inline_comments_enabled>"
            : "<inline_comments_enabled>false</inline_comments_enabled>";

        const system = `${STANDARD_REVIEW_PROMPT}\n\n${inlineModeTag}\n\nLanguage: ${this.language}`;
        const prompt = await this.generateMergeRequestPrompt(mrIid);

        const { sourceBranch } = await this.provider.fetchMergeRequestDetail(mrIid);

        await runAgentLoop(this.sender, system, prompt, `[MR #${mrIid}] Standard Review Agent`, {
            toolList: [
                ...this.createCodeToolList(mrIid, sourceBranch),
                ...this.createReviewToolList(mrIid, this.inlineReview),
            ],
            maxSteps: 200,
        });
    }

    // #########################################################
    // # Deep Review
    // #########################################################

    public async planDeepReview(mrIid: number): Promise<ReviewTarget[]> {
        const { sourceBranch } = await this.provider.fetchMergeRequestDetail(mrIid);

        const reviewTargetList: ReviewTarget[] = [];

        await runAgentLoop(
            this.sender,
            DEEP_REVIEW_PLAN_PROMPT,
            await this.generateMergeRequestPrompt(mrIid),
            `[MR #${mrIid}] Deep Plan`,
            {
                toolList: [...this.createCodeToolList(mrIid, sourceBranch), appendReviewTargetTool(reviewTargetList)],
            },
        );

        return reviewTargetList;
    }

    public async generateDeepReview(mrIid: number, reviewTargetList: ReviewTarget[]): Promise<void> {
        const { sourceBranch } = await this.provider.fetchMergeRequestDetail(mrIid);

        // const reviewResultList: string[] = [];
        const reviewResultList = await Promise.all(
            reviewTargetList.map(async (reviewTarget, index) =>
                this.runDeepReviewSubAgent(mrIid, reviewTarget, index + 1, reviewTargetList.length),
            ),
        );

        const inlineModeTag = this.inlineReview
            ? "<inline_comments_enabled>true</inline_comments_enabled>"
            : "<inline_comments_enabled>false</inline_comments_enabled>";

        const system = `${DEEP_REVIEW_COMMENT_PROMPT}\n\n${inlineModeTag}\n\nSpecialist findings:\n${JSON.stringify(reviewResultList)}\n\nLanguage: ${this.language}`;
        await runAgentLoop(
            this.sender,
            system,
            await this.generateMergeRequestPrompt(mrIid),
            `[MR #${mrIid}] Deep Writing`,
            {
                toolList: [
                    ...this.createCodeToolList(mrIid, sourceBranch),
                    ...this.createReviewToolList(mrIid, this.inlineReview),
                ],
            },
        );
    }

    private async runDeepReviewSubAgent(
        mrIid: number,
        reviewTarget: ReviewTarget,
        index: number,
        totalIndex: number,
    ): Promise<string> {
        const maxSteps = 100;

        const system = `${DEEP_REVIEW_SUB_AGENT_PROMPT}\n\nLanguage: ${this.language}`;
        const prompt = [
            await this.generateMergeRequestPrompt(mrIid),
            `Review target: ${JSON.stringify(reviewTarget)}`,
        ].join("\n\n");

        const { sourceBranch } = await this.provider.fetchMergeRequestDetail(mrIid);

        const stats = await runAgentLoop(
            this.sender,
            system,
            prompt,
            `[MR #${mrIid}] Deep Sub Agent ${index + 1}/${totalIndex}`,
            {
                toolList: [...this.createCodeToolList(mrIid, sourceBranch)],
                maxSteps,
            },
        );

        if (!stats.finalMessage) {
            throw new Error("Sub agent failed to return final message");
        }

        return stats.finalMessage;
    }

    // #########################################################
    // # Reply
    // #########################################################

    public async reply(mrIid: number, commenterUsername: string, commentBody: string): Promise<void> {
        const { sourceBranch } = await this.provider.fetchMergeRequestDetail(mrIid);

        const commentList = await this.provider.fetchMergeRequestCommentList(mrIid);

        const system = `${REPLY_PROMPT}`;
        const prompt = `Commenter Username: ${commenterUsername}, Comment Body: ${commentBody}, Comment List: ${JSON.stringify(commentList)}`;
        const toolList = [
            ...this.createCodeToolList(mrIid, sourceBranch),
            ...this.createReplyToolList(mrIid, commenterUsername),
        ];

        await runAgentLoop(this.sender, system, prompt, `MR #${mrIid} - Reply Agent`, { toolList });
    }

    // #########################################################
    // # Tools
    // #########################################################

    private createCodeToolList(mrIid: number, sourceBranch: string): AgentTool[] {
        return [
            // getMergeRequestDetailTool(this.provider, mrIid),
            // getChangedFileListTool(this.provider, mrIid),
            getFileDiffTool(this.provider, mrIid),
            ...(this.provider.isCodeSearchSupported() ? [searchCodeListTool(this.provider, sourceBranch)] : []),
            searchLineByKeywordTool(this.provider, sourceBranch),
            getDirectoryTreeTool(this.provider, sourceBranch),
            getFileContentTool(this.provider, sourceBranch),
            // getMergeRequestVersionTool(this.provider, mrIid),
        ];
    }

    private createReviewToolList(mrIid: number, inlineReview: boolean): AgentTool[] {
        return [
            postMergeRequestCommentTool(this.provider, mrIid),
            ...(inlineReview
                ? [createSingleLineCommentTool(this.provider, mrIid), createMultiLineCommentTool(this.provider, mrIid)]
                : []),
        ];
    }

    private createReplyToolList(mrIid: number, commenterUsername: string): AgentTool[] {
        return [postMergeRequestReplyTool(this.provider, mrIid, commenterUsername)];
    }

    private createApprovalToolList(mrIid: number): AgentTool[] {
        return [approveMergeRequestTool(this.provider, mrIid), unapproveMergeRequestTool(this.provider, mrIid)];
    }

    // #########################################################
    // # Utils
    // #########################################################

    private async generateMergeRequestPrompt(mrIid: number): Promise<string> {
        const detail = await this.provider.fetchMergeRequestDetail(mrIid);
        const changedFiles = await this.provider.fetchChangedFileList(mrIid);
        const version = await this.provider.fetchMergeRequestVersion(mrIid);

        const mrIidPrompt = `Merge Request IID: ${mrIid}`;
        const detailPrompt = `Merge request: ${JSON.stringify(detail)}`;
        const versionPrompt = `Merge request version: ${JSON.stringify(version)}`;
        const changedFileList = changedFiles
            .map((d) => d.newPath ?? d.oldPath)
            .filter((path) => path !== null)
            .join(", ");

        const changedFileListPrompt = `Changed files: ${changedFileList}`;

        return [mrIidPrompt, detailPrompt, versionPrompt, changedFileListPrompt].join("\n\n");
    }
}
