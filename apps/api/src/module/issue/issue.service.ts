import type { ActivityTokenUsage } from "@proval/types";
import { runAgentLoop, type AgentTool, type LlmSender } from "../../agent/loop.js";
import { createSender, type SenderConfig } from "../../agent/factory.js";
import {
    getDirectoryTreeTool,
    getFileContentTool,
    getIssueCommentListTool,
    getIssueDetailTool,
    postIssueCommentTool,
    postIssueReplyTool,
    searchCodeListTool,
    searchLineByKeywordTool,
    searchIssueListTool,
    searchPullRequestListTool,
} from "../../agent/tool/index.js";
import type { GitProvider } from "../../provider/types.js";
import { COMMENT_ON_OPEN_PROMPT, ISSUE_REPLY_PROMPT } from "./prompt/index.js";

export class IssueService {
    private readonly sender: LlmSender;

    constructor(
        private readonly provider: GitProvider,
        senderConfig: SenderConfig,
        private readonly language: string,
    ) {
        this.sender = createSender(senderConfig);
    }

    public async commentOnOpen(issueIid: number): Promise<ActivityTokenUsage> {
        const repository = await this.provider.fetchRepositoryDetail();
        const system = `${COMMENT_ON_OPEN_PROMPT}\n\nLanguage: ${this.language}`;
        const prompt = await this.generateIssuePrompt(issueIid, repository.defaultBranch);
        const toolList = [
            ...this.createIssueToolList(issueIid),
            ...this.createCodeToolList(repository.defaultBranch),
            ...this.createCommentToolList(issueIid),
        ];

        const stats = await runAgentLoop(this.sender, system, prompt, `Issue #${issueIid} - Comment On Open`, {
            toolList,
        });

        if (process.env.NODE_ENV === "development") {
            const model = this.sender.getModel();

            const comment = `## Debug Comment\n\n
                Issue IID: ${issueIid}\n\n
                Model: ${model.model} (${model.provider}) @ ${model.baseUrl}\n\n
                Input Token: ${stats.totalInputToken}\n
                Output Token: ${stats.totalOutputToken}\n
            `;

            await this.provider.createIssueComment(issueIid, comment);
        }

        return {
            inputToken: stats.totalInputToken,
            outputToken: stats.totalOutputToken,
        };
    }

    public async reply(issueIid: number, commenterUsername: string, commentBody: string): Promise<ActivityTokenUsage> {
        const repository = await this.provider.fetchRepositoryDetail();
        const issueComments = await this.provider.fetchIssueCommentList(issueIid);
        const system = `${ISSUE_REPLY_PROMPT}\n\nLanguage: ${this.language}`;
        const prompt = [
            await this.generateIssuePrompt(issueIid, repository.defaultBranch),
            `Commenter Username: ${commenterUsername}`,
            `Comment Body: ${commentBody}`,
            `Comment List: ${JSON.stringify(issueComments)}`,
        ].join("\n\n");
        const toolList = [
            ...this.createIssueToolList(issueIid),
            ...this.createCodeToolList(repository.defaultBranch),
            ...this.createReplyToolList(issueIid, commenterUsername),
        ];

        const stats = await runAgentLoop(this.sender, system, prompt, `Issue #${issueIid} - Reply`, { toolList });

        if (process.env.NODE_ENV === "development") {
            const model = this.sender.getModel();
            const comment = `## Debug Comment\n\n
                Issue IID: ${issueIid}\n\n
                Model: ${model.model} (${model.provider}) @ ${model.baseUrl}\n\n
                Input Token: ${stats.totalInputToken}\n
                Output Token: ${stats.totalOutputToken}\n
            `;
            await this.provider.createIssueComment(issueIid, comment);
        }

        return {
            inputToken: stats.totalInputToken,
            outputToken: stats.totalOutputToken,
        };
    }

    private createIssueToolList(issueIid: number): AgentTool[] {
        return [
            getIssueDetailTool(this.provider, issueIid),
            getIssueCommentListTool(this.provider, issueIid),
            searchIssueListTool(this.provider),
            searchPullRequestListTool(this.provider),
        ];
    }

    private createCodeToolList(ref: string): AgentTool[] {
        return [
            ...(this.provider.isCodeSearchSupported() ? [searchCodeListTool(this.provider, ref)] : []),
            searchLineByKeywordTool(this.provider, ref),
            getDirectoryTreeTool(this.provider, ref),
            getFileContentTool(this.provider, ref),
        ];
    }

    private createCommentToolList(issueIid: number): AgentTool[] {
        return [postIssueCommentTool(this.provider, issueIid)];
    }

    private createReplyToolList(issueIid: number, commenterUsername: string): AgentTool[] {
        return [postIssueReplyTool(this.provider, issueIid, commenterUsername)];
    }

    private async generateIssuePrompt(issueIid: number, defaultBranch: string): Promise<string> {
        const detail = await this.provider.fetchIssueDetail(issueIid);
        const comments = await this.provider.fetchIssueCommentList(issueIid);

        return [
            `Issue IID: ${issueIid}`,
            `Default branch for repository exploration: ${defaultBranch}`,
            `Issue: ${JSON.stringify(detail)}`,
            `Existing issue comments: ${JSON.stringify(comments)}`,
        ].join("\n\n");
    }
}
