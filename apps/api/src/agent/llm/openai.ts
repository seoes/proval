import OpenAI from "openai";
import type { LlmSender, Message } from "./loop.js";
import type { SenderSDKConfig } from "./factory.js";
import z from "zod";

const completionErrorSchema = z.object({
    error: z.object({
        code: z.union([z.number(), z.string()]).optional(),
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

            const request: OpenAI.Chat.ChatCompletionCreateParams = {
                model: config.model,
                messages: messages.map(convertToOpenAiMessage),
                ...(openAiTools.length > 0 ? { tools: openAiTools, tool_choice: "auto" as const } : {}),
                ...(config.reasoningEffort
                    ? {
                          reasoning_effort:
                              config.reasoningEffort as OpenAI.Chat.ChatCompletionCreateParams["reasoning_effort"],
                      }
                    : {}),
            };

            // Streaming sends the first bytes immediately, so a proxy between
            // Proval and the model does not cut a long reasoning step for
            // silence. The model provider screen controls the choice.
            if (config.stream) {
                const stream = await client.chat.completions.create({
                    ...request,
                    stream: true,
                    stream_options: { include_usage: true },
                });

                let accumulated: AccumulatedChatCompletion;
                try {
                    accumulated = await accumulateChatCompletionStream(stream);
                } catch (error) {
                    // The SDK turns an in-stream error frame into an APIError
                    // before the accumulator sees it; that error keeps the
                    // provider code but no status, which the retry check reads.
                    if (
                        error instanceof OpenAI.APIError &&
                        error.status === undefined &&
                        typeof error.code === "number"
                    ) {
                        (error as { status?: number }).status = error.code;
                    }
                    throw error;
                }

                // A provider can answer 200 and report the failure inside the stream.
                if (accumulated.error) {
                    const error = new Error(accumulated.error.message) as Error & { status?: number };
                    if (accumulated.error.status !== undefined) {
                        error.status = accumulated.error.status;
                    }
                    throw error;
                }

                // A stream that never reported a finish reason did not complete.
                // The buffered call failed loudly on this shape; keep failing loudly.
                if (accumulated.finishReason === null) {
                    throw new Error("The model stream ended without a finish reason");
                }

                return {
                    message: {
                        role: "assistant",
                        content: accumulated.content,
                        toolCalls: accumulated.toolCalls,
                    },
                    finishReason: accumulated.finishReason,
                    requestId: accumulated.id,
                    usage: {
                        inputToken: accumulated.promptTokens,
                        outputToken: accumulated.completionTokens,
                        cachedInputToken: accumulated.cachedInputTokens,
                    },
                };
            }

            const completion = await client.chat.completions.create({ ...request });

            // A provider can answer 200 and report the failure inside the body.
            const result = completionErrorSchema.safeParse(completion);
            if (result.success) {
                const error = new Error(result.data.error.message) as Error & { status?: number };
                if (typeof result.data.error.code === "number") {
                    error.status = result.data.error.code;
                }
                throw error;
            }

            // choices can be absent entirely when a provider answers 200 with an
            // error shaped body, so read it defensively before the guard.
            const choice = (completion as { choices?: typeof completion.choices }).choices?.[0];
            if (!choice) {
                throw new Error("The model provider returned a completion without choices");
            }
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

export type AccumulatedChatCompletion = {
    id: string | null;
    content: string | null;
    toolCalls: { id: string; name: string; arguments: string }[] | undefined;
    finishReason: OpenAI.Chat.ChatCompletion.Choice["finish_reason"] | null;
    promptTokens: number;
    completionTokens: number;
    cachedInputTokens: number;
    error: { message: string; status?: number } | null;
};

// Rebuild one completion from the stream chunks: content, tool-call fragments
// and usage. Tool calls arrive in pieces, indexed by `tool_calls[].index`, and
// the arguments of one call can be split across several chunks.
export async function accumulateChatCompletionStream(
    stream: AsyncIterable<OpenAI.Chat.ChatCompletionChunk>,
): Promise<AccumulatedChatCompletion> {
    let id: string | null = null;
    let content = "";
    let finishReason: OpenAI.Chat.ChatCompletion.Choice["finish_reason"] | null = null;
    let promptTokens = 0;
    let completionTokens = 0;
    let cachedInputTokens = 0;
    let error: { message: string; status?: number } | null = null;
    const toolCalls = new Map<number, { id: string; name: string; arguments: string }>();

    for await (const chunk of stream) {
        const chunkError = (chunk as { error?: { message?: string; code?: number | string } }).error;
        if (chunkError) {
            error = {
                message: chunkError.message ?? "The model provider returned an error",
                ...(typeof chunkError.code === "number" ? { status: chunkError.code } : {}),
            };
            continue;
        }

        if (chunk.id) id = chunk.id;

        if (chunk.usage) {
            promptTokens = chunk.usage.prompt_tokens ?? promptTokens;
            completionTokens = chunk.usage.completion_tokens ?? completionTokens;
            cachedInputTokens = chunk.usage.prompt_tokens_details?.cached_tokens ?? cachedInputTokens;
        }

        const choice = chunk.choices?.[0];
        if (!choice) continue;
        if (choice.finish_reason) finishReason = choice.finish_reason;

        const delta = choice.delta;
        if (!delta) continue;
        if (delta.content) content += delta.content;

        for (const toolCall of delta.tool_calls ?? []) {
            const index = toolCall.index ?? 0;
            const current = toolCalls.get(index) ?? { id: "", name: "", arguments: "" };
            if (toolCall.id) current.id = toolCall.id;
            if (toolCall.function?.name) current.name = toolCall.function.name;
            if (toolCall.function?.arguments) current.arguments += toolCall.function.arguments;
            toolCalls.set(index, current);
        }
    }

    return {
        id,
        content: content.length > 0 ? content : null,
        toolCalls:
            toolCalls.size > 0
                ? [...toolCalls.entries()].sort(([a], [b]) => a - b).map(([, value]) => value)
                : undefined,
        finishReason,
        promptTokens,
        completionTokens,
        cachedInputTokens,
        error,
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
