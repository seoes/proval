import OpenAI from "openai";
import type { LlmSender, Message } from "./loop.js";

export interface OpenAiConfig {
    apiKey: string;
    baseURL: string;
    model: string;
}

export function createOpenAiSender(config: OpenAiConfig): LlmSender {
    const client = new OpenAI({ apiKey: config.apiKey, baseURL: config.baseURL });

    return {
        async send(messages, tools) {
            const openAiTools: OpenAI.Chat.ChatCompletionTool[] = tools.map((t) => ({
                type: "function",
                function: {
                    name: t.name,
                    description: t.description,
                    parameters: t.parameters,
                },
            }));

            const completion = await client.chat.completions.create({
                model: config.model,
                messages: messages.map(convertToOpenAiMessage),
                tools: openAiTools,
                tool_choice: "auto",
            });

            const choice = completion.choices[0];
            const message = choice.message;

            return {
                message: {
                    role: "assistant",
                    content: message.content ?? null,
                    toolCalls: message.tool_calls?.map((tc) => ({
                        id: tc.id,
                        name: tc.function.name,
                        arguments: tc.function.arguments,
                    })),
                },
                finishReason: choice.finish_reason,
            };
        },
        async sendWithStructuredOutput(messages, schema) {
            const completion = await client.chat.completions.create({
                model: config.model,
                messages: [
                    ...messages.map(convertToOpenAiMessage),
                    { role: "user", content: `Return ONLY the JSON object. ${schema.toJSONSchema()}` },
                ],
                response_format: {
                    type: "json_object",
                },
            });

            const choice = completion.choices[0];
            const message = choice.message;

            return {
                message: {
                    role: "assistant",
                    content: message.content ?? null,
                    toolCalls: message.tool_calls?.map((tc) => ({
                        id: tc.id,
                        name: tc.function.name,
                        arguments: tc.function.arguments,
                    })),
                },
                finishReason: choice.finish_reason,
            };
        },
    };
}

function convertToOpenAiMessage(m: Message): OpenAI.Chat.ChatCompletionMessageParam {
    switch (m.role) {
        case "system":
            return { role: "system", content: m.content ?? "" };
        case "user":
            return { role: "user", content: m.content ?? "" };
        case "assistant":
            if (m.toolCalls && m.toolCalls.length > 0) {
                return {
                    role: "assistant",
                    content: m.content ?? null,
                    tool_calls: m.toolCalls.map((tc) => ({
                        id: tc.id,
                        type: "function",
                        function: { name: tc.name, arguments: tc.arguments },
                    })),
                };
            }
            return { role: "assistant", content: m.content ?? null };
        case "tool":
            return {
                role: "tool",
                tool_call_id: m.toolCallId ?? "",
                content: m.content ?? "",
            };
    }
}
