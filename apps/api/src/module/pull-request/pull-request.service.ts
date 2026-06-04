import { runAgentLoop, type AgentTool, type LlmSender } from "../../agent/loop.js";
import { createSender, type SenderConfig } from "../../agent/factory.js";
import {
    getFileDiffTool,
    getDirectoryTreeTool,
    getFileContentTool,
    searchCodeListTool,
    searchLineByKeywordTool,
    postPullRequestCommentTool,
    postPullRequestReplyTool,
    createSingleLineCommentTool,
    createMultiLineCommentTool,
    approvePullRequestTool,
    unapprovePullRequestTool,
    appendReviewTargetTool,
    getPullRequestDetailTool,
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
import type { ActivityTokenUsage } from "@proval/types";

export type { ReviewTarget } from "./review-target.schema.js";

export class PullRequestService {
    private readonly sender: LlmSender;

    constructor(
        private readonly provider: GitProvider,
        senderConfig: SenderConfig,
        private readonly language: string,
    ) {
        this.sender = createSender(senderConfig);
    }

    public async review(
        prIid: number,
        { isInlineReview, isDeepResearch }: { isInlineReview: boolean; isDeepResearch: boolean },
    ): Promise<ActivityTokenUsage> {
        let inputToken = 0;
        let outputToken = 0;
        if (isDeepResearch) {
            const planResult = await this.planDeepReview(prIid);
            const reviewResult = await this.generateDeepReview(prIid, planResult.reviewTargetList, isInlineReview);
            inputToken = planResult.inputToken + reviewResult.inputToken;
            outputToken = planResult.outputToken + reviewResult.outputToken;
        } else {
            const reviewResult = await this.generateStandardReview(prIid, isInlineReview);
            inputToken = reviewResult.inputToken;
            outputToken = reviewResult.outputToken;
        }

        if (process.env.NODE_ENV === "development") {
            // Create debug comment
            const model = this.sender.getModel();
            const comment = `## Debug Comment\n\n
                Pull Request IID: ${prIid}\n\n
                Model: ${model.model} (${model.provider}) @ ${model.baseUrl}\n\n
                Deep Research: ${isDeepResearch}\n
                Inline Review: ${isInlineReview}\n\n
                Input Token: ${inputToken}\n
                Output Token: ${outputToken}\n
            `;

            await this.provider.createPullRequestComment(prIid, comment);
        }

        return {
            inputToken,
            outputToken,
        };
    }

    // #########################################################
    // # Standard Review
    // #########################################################

    public async generateStandardReview(prIid: number, isInlineReview: boolean): Promise<ActivityTokenUsage> {
        const inlineModeTag = isInlineReview
            ? "<inline_comments_enabled>true</inline_comments_enabled>"
            : "<inline_comments_enabled>false</inline_comments_enabled>";

        const system = `${STANDARD_REVIEW_PROMPT}\n\n${inlineModeTag}\n\nLanguage: ${this.language}`;
        const prompt = await this.generatePullRequestPrompt(prIid);

        const { sourceBranch } = await this.provider.fetchPullRequestDetail(prIid);

        const stats = await runAgentLoop(this.sender, system, prompt, `${this.getLabel(prIid)} Standard Review`, {
            toolList: [
                ...this.createCodeToolList(prIid, sourceBranch),
                ...this.createReviewToolList(prIid, isInlineReview),
            ],
            maxSteps: 200,
        });

        return {
            inputToken: stats.totalInputToken,
            outputToken: stats.totalOutputToken,
        };
    }

    // #########################################################
    // # Deep Review
    // #########################################################

    public async planDeepReview(
        prIid: number,
    ): Promise<{ reviewTargetList: ReviewTarget[]; inputToken: number; outputToken: number }> {
        const { sourceBranch } = await this.provider.fetchPullRequestDetail(prIid);

        const reviewTargetList: ReviewTarget[] = [];

        const stats = await runAgentLoop(
            this.sender,
            DEEP_REVIEW_PLAN_PROMPT,
            await this.generatePullRequestPrompt(prIid),
            `${this.getLabel(prIid)} Deep Plan`,
            {
                toolList: [...this.createCodeToolList(prIid, sourceBranch), appendReviewTargetTool(reviewTargetList)],
            },
        );

        return {
            reviewTargetList,
            inputToken: stats.totalInputToken,
            outputToken: stats.totalOutputToken,
        };
    }

    public async generateDeepReview(
        prIid: number,
        reviewTargetList: ReviewTarget[],
        isInlineReview: boolean,
    ): Promise<{ inputToken: number; outputToken: number }> {
        const { sourceBranch } = await this.provider.fetchPullRequestDetail(prIid);

        const reviewResultList = await Promise.all(
            reviewTargetList.map(async (reviewTarget, index) =>
                this.runDeepReviewSubAgent(prIid, reviewTarget, index + 1, reviewTargetList.length),
            ),
        );

        const inlineModeTag = isInlineReview
            ? "<inline_comments_enabled>true</inline_comments_enabled>"
            : "<inline_comments_enabled>false</inline_comments_enabled>";

        const system = `${DEEP_REVIEW_COMMENT_PROMPT}\n\n${inlineModeTag}\n\nSpecialist findings:\n${JSON.stringify(reviewResultList.map((d) => d.finalMessage))}\n\nLanguage: ${this.language}`;
        const stats = await runAgentLoop(
            this.sender,
            system,
            await this.generatePullRequestPrompt(prIid),
            `${this.getLabel(prIid)} Deep Writing`,
            {
                toolList: [
                    ...this.createCodeToolList(prIid, sourceBranch),
                    ...this.createReviewToolList(prIid, isInlineReview),
                ],
            },
        );

        return {
            inputToken: stats.totalInputToken + reviewResultList.reduce((acc, curr) => acc + curr.inputToken, 0),
            outputToken: stats.totalOutputToken + reviewResultList.reduce((acc, curr) => acc + curr.outputToken, 0),
        };
    }

    private async runDeepReviewSubAgent(
        prIid: number,
        reviewTarget: ReviewTarget,
        index: number,
        totalIndex: number,
    ): Promise<{ finalMessage: string; inputToken: number; outputToken: number }> {
        const maxSteps = 100;

        const system = `${DEEP_REVIEW_SUB_AGENT_PROMPT}\n\nLanguage: ${this.language}`;
        const prompt = [
            await this.generatePullRequestPrompt(prIid),
            `Review target: ${JSON.stringify(reviewTarget)}`,
        ].join("\n\n");

        const { sourceBranch } = await this.provider.fetchPullRequestDetail(prIid);

        const stats = await runAgentLoop(
            this.sender,
            system,
            prompt,
            `${this.getLabel(prIid)} Deep Sub Agent ${index}/${totalIndex}`,
            {
                toolList: [...this.createCodeToolList(prIid, sourceBranch)],
                maxSteps,
            },
        );

        if (!stats.finalMessage) {
            throw new Error("Sub agent failed to return final message");
        }

        return {
            finalMessage: stats.finalMessage,
            inputToken: stats.totalInputToken,
            outputToken: stats.totalOutputToken,
        };
    }

    // #########################################################
    // # Reply
    // #########################################################

    public async reply(prIid: number, commenterUsername: string, commentBody: string): Promise<ActivityTokenUsage> {
        const { sourceBranch } = await this.provider.fetchPullRequestDetail(prIid);

        const commentList = await this.provider.fetchPullRequestCommentList(prIid);

        const system = `${REPLY_PROMPT}`;
        const prompt = `Commenter Username: ${commenterUsername}, Comment Body: ${commentBody}, Comment List: ${JSON.stringify(commentList)}`;
        const toolList = [
            ...this.createCodeToolList(prIid, sourceBranch),
            ...this.createReplyToolList(prIid, commenterUsername),
        ];

        const stats = await runAgentLoop(this.sender, system, prompt, `${this.getLabel(prIid)} Reply`, {
            toolList,
        });

        if (process.env.NODE_ENV === "development") {
            const model = this.sender.getModel();
            const comment = `## Debug Comment\n\n
                Pull Request IID: ${prIid}\n\n
                Model: ${model.model} (${model.provider}) @ ${model.baseUrl}\n\n
                Input Token: ${stats.totalInputToken}\n
                Output Token: ${stats.totalOutputToken}\n
            `;

            await this.provider.createPullRequestComment(prIid, comment);
        }

        return {
            inputToken: stats.totalInputToken,
            outputToken: stats.totalOutputToken,
        };
    }

    // #########################################################
    // # Tools
    // #########################################################

    private createCodeToolList(prIid: number, sourceBranch: string): AgentTool[] {
        return [
            getPullRequestDetailTool(this.provider, prIid),
            getFileDiffTool(this.provider, prIid),
            ...(this.provider.isCodeSearchSupported() ? [searchCodeListTool(this.provider, sourceBranch)] : []),
            searchLineByKeywordTool(this.provider, sourceBranch),
            getDirectoryTreeTool(this.provider, sourceBranch),
            getFileContentTool(this.provider, sourceBranch),
        ];
    }

    private createReviewToolList(prIid: number, inlineReview: boolean): AgentTool[] {
        return [
            postPullRequestCommentTool(this.provider, prIid),
            ...(inlineReview
                ? [createSingleLineCommentTool(this.provider, prIid), createMultiLineCommentTool(this.provider, prIid)]
                : []),
        ];
    }

    private createReplyToolList(prIid: number, commenterUsername: string): AgentTool[] {
        return [postPullRequestReplyTool(this.provider, prIid, commenterUsername)];
    }

    private createApprovalToolList(prIid: number): AgentTool[] {
        return [approvePullRequestTool(this.provider, prIid), unapprovePullRequestTool(this.provider, prIid)];
    }

    // #########################################################
    // # Prompt Builder
    // #########################################################

    private async generatePullRequestPrompt(prIid: number): Promise<string> {
        const {
            title: _title,
            description: _description,
            ...detail
        } = await this.provider.fetchPullRequestDetail(prIid);
        const changedFiles = await this.provider.fetchChangedFileList(prIid);
        const version = await this.provider.fetchPullRequestVersion(prIid);
        const existingCommentList = await this.provider.fetchPullRequestCommentList(prIid);

        const prIidPrompt = `Pull Request IID: ${prIid}`;
        const detailPrompt = `Pull request: ${JSON.stringify(detail)}`;
        const versionPrompt = `Pull request version: ${JSON.stringify(version)}`;
        const changedFileList = changedFiles
            .map((d) => d.newPath ?? d.oldPath)
            .filter((path) => path !== null)
            .join(", ");

        const changedFileListPrompt = `Changed files: ${changedFileList}`;
        const existingCommentListPrompt = `Existing comments: ${JSON.stringify(existingCommentList)}`;

        return [prIidPrompt, detailPrompt, versionPrompt, changedFileListPrompt, existingCommentListPrompt].join(
            "\n\n",
        );
    }

    // #########################################################
    // # Utils
    // #########################################################

    private getLabel(prIid: number): string {
        return `[PR #${prIid}]`;
    }
}
