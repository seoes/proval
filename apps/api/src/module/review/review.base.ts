import { generateText, stepCountIs } from "ai";
import { createOpenAI, type OpenAIProvider } from "@ai-sdk/openai";
import type { GitProvider } from "../../provider/types.js";

interface RunOptions {
    system: string;
    prompt: string;
    tools: Record<string, any>;
    maxSteps?: number;
}

export abstract class ReviewBase {
    protected readonly ai: OpenAIProvider;

    constructor(
        protected readonly provider: GitProvider,
        modelBaseUrl: string,
        modelApiKey: string,
        protected readonly modelName: string,
        protected readonly language: string,
    ) {
        this.ai = createOpenAI({ apiKey: modelApiKey, baseURL: modelBaseUrl });
    }

    protected async run(opts: RunOptions): Promise<void> {
        const { steps } = await generateText({
            model: this.ai.chat(this.modelName),
            tools: opts.tools,
            stopWhen: stepCountIs(opts.maxSteps ?? 15),
            system: opts.system,
            prompt: opts.prompt,
            onStepFinish: ({ stepNumber, toolCalls }) => {
                console.log(`\n  [Step ${stepNumber + 1}] ${toolCalls.length} tool call(s)`);
                for (const tc of toolCalls) console.log(`    → ${tc.toolName} done`);
            },
        });
        console.log(`  Completed in ${steps.length} steps`);
    }
}
