import OpenAI from "openai";
import type { LlmSender, Message } from "./loop.js";
import type { SenderSDKConfig } from "./factory.js";
import z from "zod";

const openRouterErrorSchema = z.object({
    error: z.object({
        code: z.number(),
        message: z.string(),
        metadata: z.record(z.string(), z.unknown()).optional(),
    }),
});

export function createOpenAiSender(config: SenderSDKConfig): LlmSender {
    const client = new OpenAI({
        apiKey: config.apiKey,
        baseURL: config.baseURL,
        timeout: config.timeoutSecond * 1000,
        fetch: config.fetch,
    });

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
                ...(openAiTools.length > 0 ? { tools: openAiTools, tool_choice: "auto" as const } : {}),
            });

            if (client.baseURL?.includes("openrouter.ai")) {
                const result = openRouterErrorSchema.safeParse(completion);
                if (result.success) {
                    throw new Error(result.data.error.message);
                }
            }

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
                requestId: completion.id ?? null,
                usage: {
                    inputToken: completion.usage?.prompt_tokens ?? 0,
                    outputToken: completion.usage?.completion_tokens ?? 0,
                    cachedInputToken: completion.usage?.prompt_tokens_details?.cached_tokens ?? 0,
                },
            };
        },
        getModel() {
            return { model: config.model, provider: "openai", baseUrl: config.baseURL };
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
