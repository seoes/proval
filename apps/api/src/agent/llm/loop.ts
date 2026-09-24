import { ActivityService } from "../../api/activity/activity.service.js";
import { logAgent, logAgentError, logAgentResult, logAgentTool } from "../../util/log.js";
import type { ActivityTokenUsage } from "@proval/types";
import {
    UNTRUSTED_WARNING_SYSTEM_PROMPT,
    wrapUntrustedToolContent,
} from "../shared/prompt/untrusted-warning.prompt.js";
import { compressMessages, isContextLengthExceeded } from "./compress.js";

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

export class JobCanceledError extends Error {
    constructor() {
        super("Job canceled by user");
        this.name = "JobCanceledError";
    }
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
        onUsage?: (usage: ActivityTokenUsage) => Promise<void>;
    },
): Promise<AgentRunResult> {
    const startedAt = performance.now();
    const activityId = options.activityId;
    const activityService = new ActivityService();

    let maximumContextLength = 1_000_000;
    const compressRatio = 0.5;

    async function stopIfCanceled(): Promise<void> {
        if (await activityService.isCanceled(activityId)) {
            logAgent(activityId, "Job canceled by user. Stopping agent loop.", label);
            throw new JobCanceledError();
        }
    }

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

        let currentContextLength = 0;

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

            await stopIfCanceled();

            const compressThreshold = maximumContextLength * compressRatio;

            if (currentContextLength > compressThreshold && messages.length > 2) {
                logAgent(activityId, "compressing context (proactive)", label);
                const summary = await compressMessages(sender, messages, options.onUsage);
                messages.splice(2);
                messages.push({
                    role: "user",
                    content: [
                        "Context was compressed because it exceeded the model limit. Prior tool results were dropped. Re-read files if you need the full content.",
                        "",
                        "Compressed working memory:",
                        summary,
                    ].join("\n"),
                });
                currentContextLength = 0;
            }

            let messagesWithStepInfo: Message[] = [
                ...messages,
                {
                    role: "user",
                    content: `[Step Budget: ${stepCount}/${maxSteps} steps used, ${remainingSteps} remaining]`,
                },
            ];

            let response: LlmResponse | null = null;
            let lastError: unknown;
            for (let i = 0; i < 3; i++) {
                await stopIfCanceled();
                try {
                    response = await sender.send(messagesWithStepInfo, toolList);
                    break;
                } catch (error: unknown) {
                    lastError = error;

                    const status = (error as { status: unknown }).status;

                    if (isContextLengthExceeded(error)) {
                        if (messages.length <= 2) {
                            throw error;
                        }

                        if (currentContextLength > 0) {
                            maximumContextLength = currentContextLength;
                        }

                        logAgent(activityId, "compressing context (overflow)", label);
                        const summary = await compressMessages(sender, messages, options.onUsage);
                        messages.splice(2);
                        messages.push({
                            role: "user",
                            content: [
                                "Context was compressed because it exceeded the model limit. Prior tool results were dropped. Re-read files if you need the full content.",
                                "",
                                "Compressed working memory:",
                                summary,
                            ].join("\n"),
                        });
                        currentContextLength = 0;
                        messagesWithStepInfo = [
                            ...messages,
                            {
                                role: "user",
                                content: `[Step Budget: ${stepCount}/${maxSteps} steps used, ${remainingSteps} remaining]`,
                            },
                        ];
                        continue;
                    }

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

            currentContextLength = response.usage.inputToken;

            if (options.onUsage) {
                await options.onUsage({
                    inputToken: response.usage.inputToken,
                    cachedInputToken: response.usage.cachedInputToken,
                    outputToken: response.usage.outputToken,
                });
            }

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

            await stopIfCanceled();

            const results = await Promise.all(
                response.message.toolCalls.map(async (tc) => {
                    const tool = toolList.find((t) => t.name === tc.name);
                    if (!tool) {
                        logAgentTool(activityId, label, `  → ${tc.name}`, "unknown tool, skipping");
                        return {
                            toolCallId: tc.id,
                            content: JSON.stringify({ error: `Unknown tool: ${tc.name}` }),
                        };
                    }

                    const args = JSON.parse(tc.arguments);
                    logAgentTool(activityId, label, `  → ${tool.name}`, JSON.stringify(args));

                    try {
                        const result = await tool.execute(args);
                        toolCallCount[tool.name] = (toolCallCount[tool.name] ?? 0) + 1;
                        let content = typeof result === "string" ? result : JSON.stringify(result);
                        if (tool.untrustedResult) {
                            content = wrapUntrustedToolContent(content);
                        }
                        logAgentTool(activityId, label, "result:", content);
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
        if (error instanceof JobCanceledError) {
            throw error;
        }
        logAgentError(activityId, "agent loop failed", error, label);
        throw error;
    }
    throw new Error(`${label} loop exited unexpectedly`);
}
