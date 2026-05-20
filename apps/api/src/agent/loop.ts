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
}

export interface LlmSender {
    send(messages: Message[], tools: AgentTool[]): Promise<LlmResponse>;
}

export interface AgentRunResult {
    finalMessage: string | null;
    messages: Message[];
    stepCount: number;
    toolCallCounts: Record<string, number>;
}

export async function runAgentLoop(
    sender: LlmSender,
    system: string,
    prompt: string,
    options: {
        toolList?: AgentTool[];
        maxSteps?: number;
    },
): Promise<AgentRunResult> {
    try {
        const messages: Message[] = [
            { role: "system", content: system },
            { role: "user", content: prompt },
        ];

        const maxSteps = options.maxSteps ?? 50;

        const toolList = options.toolList ?? [];
        const toolCallCounts: Record<string, number> = {};
        let stepCount = 0;
        for (let step = 0; step < maxSteps; step++) {
            stepCount++;
            const remainingSteps = maxSteps - step;

            // Inject remaining steps info into messages for this call only
            const messagesWithStepInfo: Message[] = [
                {
                    ...messages[0]!,
                    content: `${system}\n\n[Step Budget: ${stepCount}/${maxSteps} steps used, ${remainingSteps} remaining]`,
                },
                ...messages.slice(1),
            ];

            const response = await sender.send(messagesWithStepInfo, toolList);

            if (!response.message.toolCalls || response.message.toolCalls.length === 0) {
                console.log(`[Agent] Completed in ${stepCount} steps`);
                return {
                    finalMessage: response.message.content,
                    messages,
                    stepCount,
                    toolCallCounts,
                };
            }

            // Check if approaching max steps - stop gracefully
            if (step >= maxSteps - 1) {
                console.log(`[Agent] Reached max steps (${maxSteps}), stopping with current response`);
                return {
                    finalMessage:
                        response.message.content ??
                        "Maximum steps reached. The agent was unable to complete the task within the allowed steps.",
                    messages,
                    stepCount,
                    toolCallCounts,
                };
            }

            messages.push({
                role: "assistant",
                content: response.message.content,
                toolCalls: response.message.toolCalls,
            });

            console.log(`\n  [Step ${stepCount}] ${response.message.toolCalls.length} tool call(s)`);

            const results = await Promise.all(
                response.message.toolCalls.map(async (tc) => {
                    const tool = toolList.find((t) => t.name === tc.name);
                    if (!tool) {
                        console.log(`    → ${tc.name} — unknown tool, skipping`);
                        return {
                            toolCallId: tc.id,
                            content: JSON.stringify({ error: `Unknown tool: ${tc.name}` }),
                        };
                    }

                    const args = JSON.parse(tc.arguments);
                    console.log(`    → ${tool.name}(${JSON.stringify(args)})`);

                    try {
                        const result = await tool.execute(args);
                        toolCallCounts[tool.name] = (toolCallCounts[tool.name] ?? 0) + 1;
                        const content = typeof result === "string" ? result : JSON.stringify(result);
                        console.log(`      result: ${content.slice(0, 50)}${content.length > 50 ? "..." : ""}`);
                        return { toolCallId: tc.id, content };
                    } catch (err) {
                        const errorMsg = err instanceof Error ? err.message : String(err);
                        console.log(`      error: ${errorMsg}`);
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
        if (error instanceof Error) {
            console.error(`[Agent] Error: ${error.message}`);
        } else {
            console.error(`[Agent] Error: ${String(error)}`);
        }
        throw error;
    }

    // This should never be reached due to the forced completion above
    throw new Error("Agent loop exited unexpectedly");
}
