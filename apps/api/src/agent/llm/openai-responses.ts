import OpenAI from "openai";
import type { LlmResponse, LlmSender, Message, ToolCall } from "./loop.js";
import type { SenderSDKConfig } from "./factory.js";

export function createOpenAiResponsesSender(config: SenderSDKConfig): LlmSender {
    const client = new OpenAI({
        apiKey: config.apiKey,
        baseURL: config.baseURL,
        timeout: config.timeoutSecond * 1000,
        fetch: config.fetch,
        maxRetries: config.maxRetries,
    });

    return {
        async send(messageList, toolList) {
            const signal = AbortSignal.timeout(config.timeoutSecond * 1000);
            try {
                const stream = await client.responses.create(
                    {
                        model: config.model,
                        instructions: messageList
                            .filter((message) => message.role === "system")
                            .map((message) => message.content ?? "")
                            .join("\n\n"),
                        input: messageList.flatMap(convertToOpenAiInput),
                        store: false,
                        stream: true,
                        include: ["reasoning.encrypted_content"],
                        ...(config.maxOutputToken !== undefined ? { max_output_tokens: config.maxOutputToken } : {}),
                        ...(toolList.length > 0
                            ? {
                                  tools: toolList.map((tool) => ({
                                      type: "function" as const,
                                      name: tool.name,
                                      description: tool.description,
                                      parameters: tool.parameters,
                                      strict: false,
                                  })),
                                  tool_choice: "auto" as const,
                              }
                            : {}),
                        ...(config.reasoningEffort
                            ? {
                                  reasoning: {
                                      effort: config.reasoningEffort as NonNullable<
                                          OpenAI.Responses.ResponseCreateParams["reasoning"]
                                      >["effort"],
                                  },
                              }
                            : {}),
                    },
                    { signal },
                );

                for await (const event of stream) {
                    if (event.type === "response.completed") {
                        return convertFromOpenAiResponse(event.response);
                    }
                    if (event.type === "response.failed") {
                        throw new OpenAI.APIError(
                            undefined,
                            event.response.error ?? undefined,
                            "OpenAI Responses generation failed",
                            undefined,
                        );
                    }
                    if (event.type === "response.incomplete") {
                        if (
                            config.maxOutputToken !== undefined &&
                            event.response.incomplete_details?.reason === "max_output_tokens"
                        ) {
                            return { ...convertFromOpenAiResponse(event.response), finishReason: "length" };
                        }
                        throw new Error(
                            `OpenAI Responses generation incomplete (${event.response.incomplete_details?.reason ?? "unknown"})`,
                        );
                    }
                    if (event.type === "error") {
                        throw new OpenAI.APIError(undefined, event, event.message, undefined);
                    }
                }

                throw new Error("OpenAI Responses stream ended before completion");
            } catch (error) {
                if (signal.aborted) {
                    throw new OpenAI.APIConnectionTimeoutError();
                }
                throw error;
            }
        },
        getModel() {
            return { model: config.model, provider: "openai_responses", baseUrl: config.baseURL };
        },
    };
}

function convertToOpenAiInput(message: Message): OpenAI.Responses.ResponseInputItem[] {
    switch (message.role) {
        case "system":
            return [];
        case "user":
            return [{ role: "user", content: message.content ?? "" }];
        case "assistant": {
            // Replay complete output to retain reasoning across tool calls without server storage.
            if (message.responseOutputList) {
                return message.responseOutputList;
            }
            const inputList: OpenAI.Responses.ResponseInputItem[] = [];
            if (message.content !== null) {
                inputList.push({ role: "assistant", content: message.content });
            }
            for (const toolCall of message.toolCalls ?? []) {
                inputList.push({
                    type: "function_call",
                    call_id: toolCall.id,
                    name: toolCall.name,
                    arguments: toolCall.arguments,
                });
            }
            return inputList;
        }
        case "tool":
            return [{ type: "function_call_output", call_id: message.toolCallId ?? "", output: message.content ?? "" }];
    }
}

function convertFromOpenAiResponse(response: OpenAI.Responses.Response): LlmResponse {
    const textList: string[] = [];
    const toolCallList: ToolCall[] = [];
    for (const item of response.output) {
        if (item.type === "message") {
            for (const content of item.content) {
                if (content.type === "output_text") {
                    textList.push(content.text);
                } else if (content.type === "refusal") {
                    textList.push(content.refusal);
                }
            }
        } else if (item.type === "function_call") {
            toolCallList.push({ id: item.call_id, name: item.name, arguments: item.arguments });
        }
    }

    return {
        message: {
            role: "assistant",
            content: textList.length > 0 ? textList.join("\n") : null,
            toolCalls: toolCallList.length > 0 ? toolCallList : undefined,
            responseOutputList: response.output,
        },
        finishReason: toolCallList.length > 0 ? "tool_calls" : "stop",
        requestId: response.id ?? null,
        usage: {
            inputToken: response.usage?.input_tokens ?? 0,
            outputToken: response.usage?.output_tokens ?? 0,
            cachedInputToken: response.usage?.input_tokens_details?.cached_tokens ?? 0,
        },
    };
}
