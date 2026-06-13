import pc from "picocolors";
import { log, logAgentResult, logError } from "../util/log.js";

export interface AgentTool {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
    execute: (args: Record<string, unknown>) => Promise<unknown>;
}

export interface ToolCall {
    id: string;
    name: string;
    arguments: string;
}

export interface Message {
    role: "system" | "user" | "assistant" | "tool";
    content: string | null;
    toolCalls?: ToolCall[];
    toolCallId?: string;
}

export interface LlmResponse {
    message: Message;
    finishReason: string;
    requestId: string | null;
    tokenUsage: {
        input: number;
        output: number;
        cachedInput: number;
    };
}

export interface LlmSender {
    send(messages: Message[], tools: AgentTool[]): Promise<LlmResponse>;
    getModel(): { model: string; provider: string; baseUrl: string };
}

export interface AgentRunResult {
    finalMessage: string | null;
    messages: Message[];
    stepCount: number;
    toolCallCount: Record<string, number>;
    totalInputToken: number;
    totalCachedInputToken: number;
    totalOutputToken: number;
}

export async function runAgentLoop(
    sender: LlmSender,
    system: string,
    prompt: string,
    label: string,
    options: {
        toolList?: AgentTool[];
        maxSteps?: number;
    },
): Promise<AgentRunResult> {
    const startedAt = performance.now();

    let totalInputToken = 0;
    let totalCachedInputToken = 0;
    let totalOutputToken = 0;

    try {
        const messages: Message[] = [
            { role: "system", content: system },
            { role: "user", content: prompt },
        ];

        const maxSteps = options.maxSteps ?? 50;

        const toolList = options.toolList ?? [];
        const toolCallCount: Record<string, number> = {};
        let stepCount = 0;
        for (let step = 0; step < maxSteps; step++) {
            stepCount++;
            const remainingSteps = maxSteps - step;

            const messagesWithStepInfo: Message[] = [
                ...messages,
                {
                    role: "user",
                    content: `[Step Budget: ${stepCount}/${maxSteps} steps used, ${remainingSteps} remaining]`,
                },
            ];

            let response: LlmResponse | null = null;
            let lastError: unknown;
            for (let i = 0; i < 3; i++) {
                try {
                    response = await sender.send(messagesWithStepInfo, toolList);
                    break;
                } catch (error: unknown) {
                    lastError = error;

                    const status = (error as { status: unknown }).status;
                    const isRetryable = typeof status === "number" && (status === 429 || status === 400);

                    if (!isRetryable || i > 3) {
                        throw error;
                    }

                    logError("agent loop failed", error, label);
                    log(`${pc.yellow("→")} ${pc.yellow(`retrying… ${i + 1}/3`)}`, label);

                    await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** i));
                }
            }

            if (!response) {
                throw lastError ?? new Error("No response from agent");
            }

            totalInputToken += response.tokenUsage.input;
            totalCachedInputToken += response.tokenUsage.cachedInput;
            totalOutputToken += response.tokenUsage.output;

            if (!response.message.toolCalls || response.message.toolCalls.length === 0) {
                const result: AgentRunResult = {
                    finalMessage: response.message.content,
                    messages,
                    stepCount,
                    toolCallCount,
                    totalInputToken,
                    totalCachedInputToken,
                    totalOutputToken,
                };
                logAgentResult(label, result, performance.now() - startedAt, "completed");
                return result;
            }

            // Check if approaching max steps - stop gracefully
            if (step >= maxSteps - 1) {
                const result: AgentRunResult = {
                    finalMessage:
                        response.message.content ??
                        "Maximum steps reached. The agent was unable to complete the task within the allowed steps.",
                    messages,
                    stepCount,
                    toolCallCount,
                    totalInputToken,
                    totalCachedInputToken,
                    totalOutputToken,
                };
                log(pc.yellow(`stopping at max steps (${maxSteps})`), label);
                logAgentResult(label, result, performance.now() - startedAt, "max_steps");
                return result;
            }

            messages.push({
                role: "assistant",
                content: response.message.content,
                toolCalls: response.message.toolCalls,
            });

            log(
                `step ${pc.bold(String(stepCount))}: ${pc.bold(String(response.message.toolCalls.length))} tool call(s)`,
                label,
            );

            const results = await Promise.all(
                response.message.toolCalls.map(async (tc) => {
                    const tool = toolList.find((t) => t.name === tc.name);
                    if (!tool) {
                        log(`  ${pc.dim("→")} ${pc.yellow(tc.name)} ${pc.dim("— unknown tool, skipping")}`, label);
                        return {
                            toolCallId: tc.id,
                            content: JSON.stringify({ error: `Unknown tool: ${tc.name}` }),
                        };
                    }

                    const args = JSON.parse(tc.arguments);
                    log(`  ${pc.dim("→")} ${pc.cyan(tool.name)}${pc.dim(`(${JSON.stringify(args)})`)}`, label);

                    try {
                        const result = await tool.execute(args);
                        toolCallCount[tool.name] = (toolCallCount[tool.name] ?? 0) + 1;
                        const content = typeof result === "string" ? result : JSON.stringify(result);
                        const preview = content.slice(0, 50) + (content.length > 50 ? "…" : "");
                        log(`    ${pc.green("result")}: ${pc.dim(preview)}`, label);
                        return { toolCallId: tc.id, content };
                    } catch (err) {
                        const errorMsg = err instanceof Error ? err.message : String(err);
                        log(`    ${pc.red("error")}: ${errorMsg}`, label);
                        return { toolCallId: tc.id, content: JSON.stringify({ error: errorMsg }) };
                    }
                }),
            );

            for (const r of results) {
                messages.push({
                    role: "tool",
                    content: r.content,
                    toolCallId: r.toolCallId,
                });
            }
        }
    } catch (error: unknown) {
        logError("agent loop failed", error, label);
        throw error;
    }
    throw new Error(`${label} loop exited unexpectedly`);
}
