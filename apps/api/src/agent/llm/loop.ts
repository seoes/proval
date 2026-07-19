import { logAgent, logAgentError, logAgentResult } from "../../util/log.js";
import type { ActivityTokenUsage } from "@proval/types";
import {
    UNTRUSTED_WARNING_SYSTEM_PROMPT,
    wrapUntrustedToolContent,
} from "../shared/prompt/untrusted-warning.prompt.js";

export interface AgentTool {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
    /** When true, serialized tool results are wrapped with untrusted-input delimiters. */
    untrustedResult?: boolean;
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
    usage: ActivityTokenUsage;
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
    usage: ActivityTokenUsage;
}

export async function runAgentLoop(
    sender: LlmSender,
    system: string,
    prompt: string,
    label: string,
    options: {
        toolList?: (AgentTool | null)[];
        maxSteps?: number;
        requiredToolList?: (AgentTool | null)[];
        activityId: number;
    },
): Promise<AgentRunResult> {
    const startedAt = performance.now();
    const activityId = options.activityId;

    try {
        const usage: ActivityTokenUsage = {
            inputToken: 0,
            cachedInputToken: 0,
            outputToken: 0,
        };

        const fullSystem = [system, UNTRUSTED_WARNING_SYSTEM_PROMPT].filter(Boolean).join("\n\n");

        const messages: Message[] = [
            { role: "system", content: fullSystem },
            { role: "user", content: prompt },
        ];

        const maxSteps = options.maxSteps ?? 100;

        const optionalToolList = options.toolList?.filter((t) => t !== null) ?? [];
        const requiredToolList = options.requiredToolList?.filter((t) => t !== null) ?? [];
        const requiredToolNameList = requiredToolList.map((t) => t.name);

        const toolList: AgentTool[] = [];
        const seenNameSet = new Set<string>();
        for (const tool of [...optionalToolList, ...requiredToolList]) {
            if (seenNameSet.has(tool.name)) continue;
            seenNameSet.add(tool.name);
            toolList.push(tool);
        }

        logAgent(activityId, "loop started", label);

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

                    logAgentError(activityId, "agent loop failed", error, label);
                    logAgent(activityId, `→ retrying… ${i + 1}/3`, label);

                    await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** i));
                }
            }

            if (!response) {
                throw lastError ?? new Error("No response from agent");
            }

            usage.inputToken += response.usage.inputToken;
            usage.cachedInputToken += response.usage.cachedInputToken;
            usage.outputToken += response.usage.outputToken;

            if (!response.message.toolCalls || response.message.toolCalls.length === 0) {
                if (
                    requiredToolNameList.length > 0 &&
                    requiredToolNameList.some(
                        (toolName) => toolCallCount[toolName] === undefined || toolCallCount[toolName] === 0,
                    )
                ) {
                    const missingToolNameList = requiredToolNameList.filter(
                        (toolName) => toolCallCount[toolName] === undefined || toolCallCount[toolName] === 0,
                    );
                    messages.push({ role: "assistant", content: response.message.content });
                    messages.push({
                        role: "user",
                        content: `[Required tool not called: ${missingToolNameList.join(", ")}]`,
                    });
                    continue;
                }
                const result: AgentRunResult = {
                    finalMessage: response.message.content,
                    messages,
                    stepCount,
                    toolCallCount,
                    usage,
                };
                logAgentResult(activityId, label, result, performance.now() - startedAt, "completed");
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
                    usage,
                };
                logAgent(activityId, `stopping at max steps (${maxSteps})`, label);
                logAgentResult(activityId, label, result, performance.now() - startedAt, "max_steps");
                return result;
            }

            messages.push({
                role: "assistant",
                content: response.message.content,
                toolCalls: response.message.toolCalls,
            });

            logAgent(activityId, `step ${stepCount}: ${response.message.toolCalls.length} tool call(s)`, label);

            const results = await Promise.all(
                response.message.toolCalls.map(async (tc) => {
                    const tool = toolList.find((t) => t.name === tc.name);
                    if (!tool) {
                        logAgent(activityId, `  → ${tc.name} - unknown tool, skipping`, label);
                        return {
                            toolCallId: tc.id,
                            content: JSON.stringify({ error: `Unknown tool: ${tc.name}` }),
                        };
                    }

                    const args = JSON.parse(tc.arguments);
                    logAgent(activityId, `  → ${tool.name}(${JSON.stringify(args)})`, label);

                    try {
                        const result = await tool.execute(args);
                        toolCallCount[tool.name] = (toolCallCount[tool.name] ?? 0) + 1;
                        let content = typeof result === "string" ? result : JSON.stringify(result);
                        if (tool.untrustedResult) {
                            content = wrapUntrustedToolContent(content);
                        }
                        logAgent(activityId, `    result: ${content}`, label);
                        return { toolCallId: tc.id, content };
                    } catch (err) {
                        const errorMsg = err instanceof Error ? err.message : String(err);
                        logAgentError(activityId, `    error: ${errorMsg}`, err, label);
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
        logAgentError(activityId, "agent loop failed", error, label);
        throw error;
    }
    throw new Error(`${label} loop exited unexpectedly`);
}
