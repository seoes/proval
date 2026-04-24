import { generateText, stepCountIs, type ToolSet } from "ai";
import { createOpenAI, type OpenAIProvider } from "@ai-sdk/openai";
import type { GitProvider } from "../../provider/types.js";

interface RunOptions {
    system: string;
    prompt: string;
    tools: ToolSet;
    maxSteps?: number;
}

export interface ReviewRunStats {
    stepCount: number;
    toolCallCounts: Record<string, number>;
}

export abstract class ReviewBase {
    protected readonly ai: OpenAIProvider;

    constructor(
        protected readonly provider: GitProvider,
        modelBaseUrl: string,
        modelApiKey: string,
        protected readonly modelName: string,
        protected readonly language: string,
        protected readonly allowApproval: boolean,
    ) {
        this.ai = createOpenAI({ apiKey: modelApiKey, baseURL: modelBaseUrl });
    }

    protected async run(opts: RunOptions): Promise<ReviewRunStats> {
        const toolCallCounts: Record<string, number> = {};

        const { steps } = await generateText({
            model: this.ai.chat(this.modelName),
            tools: opts.tools,
            stopWhen: stepCountIs(opts.maxSteps ?? 15),
            system: opts.system,
            prompt: opts.prompt,
            onStepFinish: ({ stepNumber, toolCalls }) => {
                console.log(`\n  [Step ${stepNumber + 1}] ${toolCalls.length} tool call(s)`);
                for (const tc of toolCalls) {
                    const name =
                        typeof tc === "object" && tc !== null && "toolName" in tc
                            ? String((tc as { toolName?: string }).toolName)
                            : "unknown";
                    console.log(`    → ${name} done`);
                    toolCallCounts[name] = (toolCallCounts[name] ?? 0) + 1;
                }
            },
        });
        console.log(`  Completed in ${steps.length} steps`, { toolCallCounts });
        return { stepCount: steps.length, toolCallCounts };
    }
}
