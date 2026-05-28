import type { ActivityTokenUsage } from "@proval/types";
import { runAgentLoop, type AgentTool } from "../../agent/loop.js";
import { createOpenAiSender } from "../../agent/openai.js";
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
    searchMergeRequestListTool,
} from "../../agent/tool/index.js";
import type { GitProvider } from "../../provider/types.js";
import { COMMENT_ON_OPEN_PROMPT, ISSUE_REPLY_PROMPT } from "./prompt/index.js";

export class IssueService {
    private readonly sender: ReturnType<typeof createOpenAiSender>;

    constructor(
        private readonly provider: GitProvider,
        modelBaseUrl: string,
        modelApiKey: string,
        modelName: string,
        private readonly language: string,
    ) {
        this.sender = createOpenAiSender({
            apiKey: modelApiKey,
            baseURL: modelBaseUrl,
            model: modelName,
        });
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
            searchMergeRequestListTool(this.provider),
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
