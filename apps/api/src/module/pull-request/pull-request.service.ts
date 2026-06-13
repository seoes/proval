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
    appendReviewUnitTool,
    skipFileTool,
    getPullRequestDetailTool,
} from "../../agent/tool/index.js";
import type { GitProvider } from "../../provider/types.js";
import type { ReviewUnit, SkippedFile } from "./review-unit.schema.js";
import {
    COMMENT_LANGUAGE_RULE,
    DEEP_REVIEW_COMMENT_WORKFLOW,
    DEEP_REVIEW_PLAN,
    DEEP_REVIEW_SUB_AGENT_BODY,
    DEEP_REVIEW_SUB_AGENT_OUTPUT_FORMAT,
    FILE_COVERAGE_RULE,
    INLINE_ENABLED,
    INLINE_DISABLED,
    PR_REPLY_BODY,
    REVIEW_CHECKLIST,
    SEVERITY,
    STANDARD_REVIEW_PROMPT,
} from "../prompt/index.js";
import type { ActivityTokenUsage } from "@proval/types";
import { debug } from "../../util/log.js";

export type { ReviewUnit, SkippedFile } from "./review-unit.schema.js";

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
        let cachedInputToken = 0;
        if (isDeepResearch) {
            const planResult = await this.planDeepReview(prIid);
            const reviewResult = await this.generateDeepReview(prIid, planResult.reviewUnitList, isInlineReview);
            inputToken = planResult.inputToken + reviewResult.inputToken;
            cachedInputToken = planResult.cachedInputToken + reviewResult.cachedInputToken;
            outputToken = planResult.outputToken + reviewResult.outputToken;
        } else {
            const reviewResult = await this.generateStandardReview(prIid, isInlineReview);
            inputToken = reviewResult.inputToken;
            cachedInputToken = reviewResult.cachedInputToken;
            outputToken = reviewResult.outputToken;
        }

        if (process.env.NODE_ENV !== "production") {
            // Create debug comment
            const model = this.sender.getModel();
            const comment = `## Debug Comment\n\n
                Pull Request IID: ${prIid}\n\n
                Model: ${model.model} (${model.provider}) @ ${model.baseUrl}\n\n
                Deep Research: ${isDeepResearch}\n
                Inline Review: ${isInlineReview}\n\n
                Input Token: ${inputToken}\n
                Cached Input Token: ${cachedInputToken}\n
                Output Token: ${outputToken}\n

            `;

            await this.provider.createPullRequestComment(prIid, comment);
        }

        return {
            inputToken,
            outputToken,
            cachedInputToken,
        };
    }

    // #########################################################
    // # Standard Review
    // #########################################################

    public async generateStandardReview(prIid: number, isInlineReview: boolean): Promise<ActivityTokenUsage> {
        const inlineModeTag = isInlineReview
            ? "<inline_comments_enabled>true</inline_comments_enabled>"
            : "<inline_comments_enabled>false</inline_comments_enabled>";
        const system = [
            STANDARD_REVIEW_PROMPT,
            FILE_COVERAGE_RULE,
            isInlineReview ? INLINE_ENABLED : INLINE_DISABLED,
            COMMENT_LANGUAGE_RULE,
            inlineModeTag,
        ].join("\n\n");
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
            cachedInputToken: stats.totalCachedInputToken,
        };
    }

    // #########################################################
    // # Deep Review
    // #########################################################

    public async planDeepReview(prIid: number): Promise<ActivityTokenUsage & { reviewUnitList: ReviewUnit[] }> {
        const { sourceBranch } = await this.provider.fetchPullRequestDetail(prIid);

        const reviewUnitList: ReviewUnit[] = [];
        const skippedFileList: SkippedFile[] = [];

        const system = [DEEP_REVIEW_PLAN, FILE_COVERAGE_RULE].join("\n\n");

        const stats = await runAgentLoop(
            this.sender,
            system,
            await this.generatePullRequestPrompt(prIid),
            `${this.getLabel(prIid)} Deep Plan`,
            {
                toolList: [
                    ...this.createCodeToolList(prIid, sourceBranch),
                    appendReviewUnitTool(reviewUnitList),
                    skipFileTool(skippedFileList),
                ],
            },
        );

        return {
            reviewUnitList,
            inputToken: stats.totalInputToken,
            outputToken: stats.totalOutputToken,
            cachedInputToken: stats.totalCachedInputToken,
        };
    }

    public async generateDeepReview(
        prIid: number,
        reviewUnitList: ReviewUnit[],
        isInlineReview: boolean,
    ): Promise<ActivityTokenUsage> {
        const { sourceBranch } = await this.provider.fetchPullRequestDetail(prIid);

        const reviewResultList = await Promise.all(
            reviewUnitList.map(async (reviewUnit, index) =>
                this.runDeepReviewSubAgent(prIid, reviewUnit, index + 1, reviewUnitList.length),
            ),
        );

        const system = [
            DEEP_REVIEW_COMMENT_WORKFLOW,
            SEVERITY,
            isInlineReview ? INLINE_ENABLED : INLINE_DISABLED,
            COMMENT_LANGUAGE_RULE,
        ].join("\n\n");

        const findingsText = reviewResultList
            .map((result, index) => `--- Unit ${index + 1} ---\n${result.finalMessage}`)
            .join("\n\n");
        const prompt = [
            await this.generatePullRequestPrompt(prIid),
            `Review unit findings (plain text, one block per sub-agent):\n\n${findingsText}`,
        ].join("\n\n");
        const stats = await runAgentLoop(this.sender, system, prompt, `${this.getLabel(prIid)} Deep Writing`, {
            toolList: [
                ...this.createCodeToolList(prIid, sourceBranch),
                ...this.createReviewToolList(prIid, isInlineReview),
            ],
        });

        return {
            inputToken: stats.totalInputToken + reviewResultList.reduce((acc, curr) => acc + curr.inputToken, 0),
            outputToken: stats.totalOutputToken + reviewResultList.reduce((acc, curr) => acc + curr.outputToken, 0),
            cachedInputToken:
                stats.totalCachedInputToken + reviewResultList.reduce((acc, curr) => acc + curr.cachedInputToken, 0),
        };
    }

    private async runDeepReviewSubAgent(
        prIid: number,
        reviewUnit: ReviewUnit,
        index: number,
        totalIndex: number,
    ): Promise<ActivityTokenUsage & { finalMessage: string }> {
        const maxSteps = 100;

        const system = [DEEP_REVIEW_SUB_AGENT_BODY, REVIEW_CHECKLIST, DEEP_REVIEW_SUB_AGENT_OUTPUT_FORMAT].join("\n\n");
        const prompt = [await this.generatePullRequestPrompt(prIid), `Review unit: ${JSON.stringify(reviewUnit)}`].join(
            "\n\n",
        );

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
            debug(JSON.stringify(stats, null, 2), "ERROR");
            throw new Error("Sub agent failed to return final message");
        }

        return {
            finalMessage: stats.finalMessage,
            inputToken: stats.totalInputToken,
            outputToken: stats.totalOutputToken,
            cachedInputToken: stats.totalCachedInputToken,
        };
    }

    // #########################################################
    // # Reply
    // #########################################################

    public async reply(prIid: number, commenterUsername: string, commentBody: string): Promise<ActivityTokenUsage> {
        const { sourceBranch } = await this.provider.fetchPullRequestDetail(prIid);

        const commentList = await this.provider.fetchPullRequestCommentList(prIid);

        const system = [PR_REPLY_BODY, COMMENT_LANGUAGE_RULE].join("\n");
        const prompt = `Commenter Username: ${commenterUsername}, Comment Body: ${commentBody}, Comment List: ${JSON.stringify(commentList)}`;
        const toolList = [
            ...this.createCodeToolList(prIid, sourceBranch),
            ...this.createReplyToolList(prIid, commenterUsername),
        ];

        const stats = await runAgentLoop(this.sender, system, prompt, `${this.getLabel(prIid)} Reply`, {
            toolList,
        });

        if (process.env.NODE_ENV !== "production") {
            const model = this.sender.getModel();
            const comment = `## Debug Comment\n\n
                Pull Request IID: ${prIid}\n\n
                Model: ${model.model} (${model.provider}) @ ${model.baseUrl}\n\n
                Input Token: ${stats.totalInputToken}\n
                Output Token: ${stats.totalOutputToken}\n
                Cached Input Token: ${stats.totalCachedInputToken}\n
            `;

            await this.provider.createPullRequestComment(prIid, comment);
        }

        return {
            inputToken: stats.totalInputToken,
            outputToken: stats.totalOutputToken,
            cachedInputToken: stats.totalCachedInputToken,
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
            postPullRequestCommentTool(this.provider, prIid, this.language),
            ...(inlineReview
                ? [
                      createSingleLineCommentTool(this.provider, prIid, this.language),
                      createMultiLineCommentTool(this.provider, prIid, this.language),
                  ]
                : []),
        ];
    }

    private createReplyToolList(prIid: number, commenterUsername: string): AgentTool[] {
        return [postPullRequestReplyTool(this.provider, prIid, commenterUsername, this.language)];
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
