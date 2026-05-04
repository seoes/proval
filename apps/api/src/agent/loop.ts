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
        const response = await sender.send(messages, toolList);

        if (!response.message.toolCalls || response.message.toolCalls.length === 0) {
            console.log(`[Agent] Completed in ${stepCount} steps`);
            return {
                finalMessage: response.message.content,
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
                    console.log(`      result: ${content.slice(0, 20)}${content.length > 20 ? "..." : ""}`);
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

    console.log(`[Agent] Reached max steps (${maxSteps})`);
    return { finalMessage: null, messages, stepCount, toolCallCounts };
}
