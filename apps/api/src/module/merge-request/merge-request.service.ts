import { runAgentLoop, type AgentTool } from "../../agent/loop.js";
import { createOpenAiSender } from "../../agent/openai.js";
import {
    getChangedFileListTool,
    getMergeRequestDetailTool,
    getFileDiffTool,
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
    appendReviewTargetTool,
} from "../../agent/tool/index.js";
import type { GitProvider } from "../../provider/types.js";
import type { ReviewTarget } from "./review-target.schema.js";
import {
    DEEP_REVIEW_PLAN_PROMPT,
    DEEP_REVIEW_SUB_AGENT_PROMPT,
    REPLY_PROMPT,
    REVIEW_PROMPT,
    STANDARD_REVIEW_PLAN_PROMPT,
} from "./merge-request.prompt.js";

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

    public async planStandardReview(mrIid: number): Promise<string> {
        const { sourceBranch } = await this.provider.fetchMergeRequestDetail(mrIid);

        const { finalMessage } = await runAgentLoop(
            this.sender,
            STANDARD_REVIEW_PLAN_PROMPT,
            await this.generateMergeRequestPrompt(mrIid),
            {
                toolList: this.createReadToolList(mrIid, sourceBranch),
            },
        );
        if (!finalMessage) {
            throw new Error("Failed to generate standard review plan");
        }
        return finalMessage;
    }

    public async generateStandardReview(mrIid: number, reviewPlan: string): Promise<void> {
        const system = `${REVIEW_PROMPT}\n\n${reviewPlan}\n\nLanguage: ${this.language}`;
        const prompt = await this.generateMergeRequestPrompt(mrIid);

        const { sourceBranch } = await this.provider.fetchMergeRequestDetail(mrIid);

        const stats = await runAgentLoop(this.sender, system, prompt, {
            toolList: [
                ...this.createReadToolList(mrIid, sourceBranch),
                ...this.createCommentToolList(mrIid),
                ...(this.inlineReview ? this.createInlineCommentToolList(mrIid) : []),
            ],
        });

        console.log(
            `[MR review] iid=${mrIid} steps=${stats.stepCount} inlineReview=${this.inlineReview} tools=${JSON.stringify(stats.toolCallCounts)}`,
        );
    }

    // #########################################################
    // # Deep Review
    // #########################################################

    public async planDeepReview(mrIid: number): Promise<ReviewTarget[]> {
        const { sourceBranch } = await this.provider.fetchMergeRequestDetail(mrIid);

        const reviewTargetList: ReviewTarget[] = [];

        const stats = await runAgentLoop(
            this.sender,
            DEEP_REVIEW_PLAN_PROMPT,
            await this.generateMergeRequestPrompt(mrIid),
            {
                toolList: [...this.createReadToolList(mrIid, sourceBranch), appendReviewTargetTool(reviewTargetList)],
            },
        );

        console.log(
            `[MR deep-plan] iid=${mrIid} steps=${stats.stepCount} targets=${reviewTargetList.length} tools=${JSON.stringify(stats.toolCallCounts)} finalMessage=${stats.finalMessage ?? "(none)"}`,
        );

        return reviewTargetList;
    }

    public async generateDeepReview(mrIid: number, reviewTargetList: ReviewTarget[]): Promise<void> {
        const { sourceBranch } = await this.provider.fetchMergeRequestDetail(mrIid);

        const reviewResultList: string[] = [];
        for (const reviewTarget of reviewTargetList) {
            const reviewResult = await this.runDeepReviewSubAgent(mrIid, reviewTarget);
            console.log(
                `[MR review] iid=${mrIid} reviewTarget=${JSON.stringify(reviewTarget)} reviewResult=${reviewResult}`,
            );
            if (!reviewResult) {
                throw new Error("Failed to run deep review sub agent");
            }
            reviewResultList.push(reviewResult);
        }

        const system = `${REVIEW_PROMPT}\n\nIf duplicate review targets appear in the specialist findings below, do not review them again.\n\n${JSON.stringify(reviewResultList)}\n\nLanguage: ${this.language}`;
        const stats = await runAgentLoop(this.sender, system, await this.generateMergeRequestPrompt(mrIid), {
            toolList: [
                ...this.createReadToolList(mrIid, sourceBranch),
                ...this.createCommentToolList(mrIid),
                ...(this.inlineReview ? this.createInlineCommentToolList(mrIid) : []),
            ],
        });

        console.log(
            `[MR review] iid=${mrIid} steps=${stats.stepCount} inlineReview=${this.inlineReview} tools=${JSON.stringify(stats.toolCallCounts)}`,
        );
    }

    private async runDeepReviewSubAgent(mrIid: number, reviewTarget: ReviewTarget): Promise<string> {
        const system = `${DEEP_REVIEW_SUB_AGENT_PROMPT}\n\nLanguage: ${this.language}`;
        const prompt = `Review target: ${JSON.stringify(reviewTarget)}`;

        const { sourceBranch } = await this.provider.fetchMergeRequestDetail(mrIid);

        const stats = await runAgentLoop(this.sender, system, prompt, {
            toolList: [...this.createReadToolList(mrIid, sourceBranch)],
        });

        console.log(
            `[MR review] iid=${mrIid} steps=${stats.stepCount} inlineReview=${this.inlineReview} tools=${JSON.stringify(stats.toolCallCounts)}`,
        );

        if (!stats.finalMessage) {
            throw new Error("Failed to run deep review sub agent");
        }

        return stats.finalMessage;
    }

    // #########################################################
    // # Reply
    // #########################################################

    public async reply(mrIid: number, commenterUsername: string, commentBody: string): Promise<void> {
        const { sourceBranch } = await this.provider.fetchMergeRequestDetail(mrIid);

        const system = `${REPLY_PROMPT}, Commenter Username: ${commenterUsername}, Comment Body: ${commentBody}`;

        const stats = await runAgentLoop(this.sender, system, await this.generateMergeRequestPrompt(mrIid), {
            toolList: [
                ...this.createReadToolList(mrIid, sourceBranch),
                ...this.createReplyToolList(mrIid, commenterUsername),
            ],
        });

        console.log(`[MR reply] iid=${mrIid} steps=${stats.stepCount} tools=${JSON.stringify(stats.toolCallCounts)}`);
    }

    // #########################################################
    // # Tools
    // #########################################################

    private createReadToolList(mrIid: number, sourceBranch: string): AgentTool[] {
        return [
            getMergeRequestDetailTool(this.provider, mrIid),
            getChangedFileListTool(this.provider, mrIid),
            getFileDiffTool(this.provider, mrIid),
            getMergeRequestCommentListTool(this.provider, mrIid),
            getDirectoryTreeTool(this.provider, sourceBranch),
            getFileContentTool(this.provider, sourceBranch),
            getMergeRequestVersionTool(this.provider, mrIid),
        ];
    }

    private createInlineCommentToolList(mrIid: number): AgentTool[] {
        return [createSingleLineCommentTool(this.provider, mrIid), createMultiLineCommentTool(this.provider, mrIid)];
    }

    private createCommentToolList(mrIid: number): AgentTool[] {
        return [postMergeRequestCommentTool(this.provider, mrIid)];
    }

    private createApprovalToolList(mrIid: number): AgentTool[] {
        return [approveMergeRequestTool(this.provider, mrIid), unapproveMergeRequestTool(this.provider, mrIid)];
    }

    private createReplyToolList(mrIid: number, commenterUsername: string): AgentTool[] {
        return [postMergeRequestReplyTool(this.provider, mrIid, commenterUsername)];
    }

    // #########################################################
    // # Utils
    // #########################################################

    private async generateMergeRequestPrompt(mrIid: number): Promise<string> {
        const detail = await this.provider.fetchMergeRequestDetail(mrIid);
        const changedFiles = await this.provider.fetchChangedFileList(mrIid);

        const mrIidPrompt = `Merge Request IID: ${mrIid}`;
        const detailPrompt = `Merge request: ${JSON.stringify(detail)}`;
        const changedFileList = changedFiles
            .map((d) => d.newPath ?? d.oldPath)
            .filter((path) => path !== null)
            .join(", ");

        const changedFileListPrompt = `Changed files: ${changedFileList}`;

        return [mrIidPrompt, detailPrompt, changedFileListPrompt].join("\n\n");
    }
}
