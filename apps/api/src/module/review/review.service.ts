import type { GitProvider } from "../../provider/types.js";
import { generateText, stepCountIs } from "ai";
import { createOpenAI, type OpenAIProvider } from "@ai-sdk/openai";
import { reviewPrompt } from "./review.prompt.js";
import {
    getDirectoryTreeTool,
    getFileContentTool,
    getMergeRequestCommentListTool,
    getMergeRequestDetailTool,
    postMergeRequestCommentTool,
    getMergeRequestDiffTool,
} from "./review.tool.js";

export class ReviewService {
    private readonly model: string;
    private readonly ai: OpenAIProvider;
    private readonly LANGUAGE: string;

    constructor(private readonly provider: GitProvider) {
        this.ai = createOpenAI({
            apiKey: process.env.LLM_API_KEY,
            baseURL: process.env.LLM_BASE_URL,
        });
        this.model = process.env.LLM_MODEL || "zai-org/glm-5";
        this.LANGUAGE = process.env.LANG_NAME || "English";
    }

    public async reviewMergeRequest(mrIid: number): Promise<void> {
        console.log("@@@ REVIEW SERVICE: Reviewing merge request");
        try {
            const toolList = await this.createMergeRequestToolList(mrIid);
            console.log("@@@ REVIEW SERVICE: Tool list created");
            const { steps } = await generateText({
                model: this.ai.chat(this.model),
                tools: toolList,
                stopWhen: stepCountIs(15),
                system: reviewPrompt,
                prompt: `Review merge request !${mrIid}. Use the available tools to gather information, then submit your review. Language: ${this.LANGUAGE}`,
                onStepFinish: ({ stepNumber, toolCalls }) => {
                    console.log(`\n  [Step ${stepNumber + 1}] ${toolCalls.length} tool call(s)`);
                    for (const tc of toolCalls) {
                        console.log(`    → ${tc.toolName} done`);
                    }
                },
            });

            console.log(`  Steps: ${steps.length}`);
        } catch (err) {
            console.error(err);
        }
    }

    private async createMergeRequestToolList(mrIid: number) {
        return {
            get_merge_request_detail: getMergeRequestDetailTool(this.provider, mrIid),
            get_merge_request_diff: getMergeRequestDiffTool(this.provider, mrIid),
            get_merge_request_comment_list: getMergeRequestCommentListTool(this.provider, mrIid),
            get_directory_tree: getDirectoryTreeTool(this.provider),
            get_file_content: getFileContentTool(this.provider),
            post_merge_request_comment: postMergeRequestCommentTool(this.provider, mrIid),
        };
    }
}
