import Anthropic from "@anthropic-ai/sdk";
import type { LlmSender, Message } from "./loop.js";

export interface AnthropicConfig {
    apiKey: string;
    baseURL: string;
    model: string;
}

export function createAnthropicSender(config: AnthropicConfig): LlmSender {
    const client = new Anthropic({
        apiKey: config.apiKey,
        baseURL: config.baseURL,
    });

    return {
        async send(messages, tools) {
            const anthropicTools: Anthropic.Messages.Tool[] = tools.map((t) => ({
                name: t.name,
                description: t.description,
                input_schema: t.parameters as Anthropic.Messages.Tool.InputSchema,
            }));

            // Anthropic separates system prompt from messages
            const systemParts: string[] = [];
            const chatMessages: Anthropic.Messages.MessageParam[] = [];

            for (const m of messages) {
                if (m.role === "system") {
                    systemParts.push(m.content ?? "");
                } else if (m.role === "tool") {
                    appendToolResult(chatMessages, m.toolCallId ?? "", m.content ?? "");
                } else {
                    chatMessages.push(convertToAnthropicMessage(m));
                }
            }

            const completion = await client.messages.create({
                model: config.model,
                system: systemParts.length > 0 ? systemParts.join("\n\n") : undefined,
                messages: chatMessages,
                tools: anthropicTools.length > 0 ? anthropicTools : undefined,
                max_tokens: 8192,
            });

            // Extract text content and tool calls from content blocks
            const textParts: string[] = [];
            const toolCalls: { id: string; name: string; arguments: string }[] = [];

            for (const block of completion.content) {
                if (block.type === "text") {
                    textParts.push(block.text);
                } else if (block.type === "tool_use") {
                    toolCalls.push({
                        id: block.id,
                        name: block.name,
                        arguments: JSON.stringify(block.input),
                    });
                }
            }

            return {
                message: {
                    role: "assistant",
                    content: textParts.length > 0 ? textParts.join("\n") : null,
                    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
                },
                finishReason: completion.stop_reason === "end_turn" ? "stop" : (completion.stop_reason ?? "stop"),
                requestId: completion.id ?? null,
                tokenUsage: {
                    input: completion.usage?.input_tokens ?? 0,
                    output: completion.usage?.output_tokens ?? 0,
                },
            };
        },
        getModel() {
            return { model: config.model, provider: "anthropic", baseUrl: config.baseURL };
        },
    };
}

function convertToAnthropicMessage(m: Message): Anthropic.Messages.MessageParam {
    switch (m.role) {
        case "user":
            return { role: "user", content: m.content ?? "" };
        case "assistant": {
            if (m.toolCalls && m.toolCalls.length > 0) {
                const content: Anthropic.Messages.ContentBlockParam[] = [];
                if (m.content) {
                    content.push({ type: "text", text: m.content });
                }
                for (const tc of m.toolCalls) {
                    content.push({
                        type: "tool_use",
                        id: tc.id,
                        name: tc.name,
                        input: parseToolArguments(tc.arguments),
                    });
                }
                return { role: "assistant", content };
            }
            return { role: "assistant", content: m.content ?? "" };
        }
        default:
            return { role: "user", content: "" };
    }
}

function appendToolResult(
    chatMessages: Anthropic.Messages.MessageParam[],
    toolUseId: string,
    content: string,
): void {
    const block: Anthropic.Messages.ToolResultBlockParam = {
        type: "tool_result",
        tool_use_id: toolUseId,
        content,
    };

    const last = chatMessages.at(-1);
    if (last?.role === "user" && isToolResultOnlyUserMessage(last)) {
        (last.content as Anthropic.Messages.ToolResultBlockParam[]).push(block);
        return;
    }

    chatMessages.push({ role: "user", content: [block] });
}

function isToolResultOnlyUserMessage(message: Anthropic.Messages.MessageParam): boolean {
    if (message.role !== "user" || !Array.isArray(message.content)) {
        return false;
    }
    return message.content.length > 0 && message.content.every((block) => block.type === "tool_result");
}

function parseToolArguments(argumentsJson: string): Record<string, unknown> {
    try {
        const parsed: unknown = JSON.parse(argumentsJson);
        if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
            return parsed as Record<string, unknown>;
        }
    } catch {
        // fall through
    }
    return {};
}
