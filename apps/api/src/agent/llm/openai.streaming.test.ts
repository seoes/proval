import { describe, expect, test } from "bun:test";
import type OpenAI from "openai";
import { accumulateChatCompletionStream, createOpenAiSender } from "./openai.js";

const encoder = new TextEncoder();

type ChunkOptions = {
    id?: string;
    delta?: Record<string, unknown>;
    finishReason?: string | null;
    usage?: Record<string, unknown> | null;
    error?: Record<string, unknown>;
    choices?: unknown[];
};

function chunkFrame(options: ChunkOptions): string {
    const payload: Record<string, unknown> = {
        id: options.id ?? "chatcmpl-test",
        object: "chat.completion.chunk",
        created: 0,
        model: "test-model",
    };
    if (options.error) {
        payload.error = options.error;
    } else {
        payload.choices = options.choices ?? [
            { index: 0, delta: options.delta ?? {}, finish_reason: options.finishReason ?? null },
        ];
    }
    if (options.usage !== undefined) {
        payload.usage = options.usage;
    }
    return `data: ${JSON.stringify(payload)}\n\n`;
}

function sseResponse(parts: string[], options: { split?: boolean } = {}): Response {
    const body = new ReadableStream<Uint8Array>({
        start(controller) {
            for (const part of parts) {
                if (options.split && part.length > 20) {
                    const middle = Math.floor(part.length / 2);
                    controller.enqueue(encoder.encode(part.slice(0, middle)));
                    controller.enqueue(encoder.encode(part.slice(middle)));
                    continue;
                }
                controller.enqueue(encoder.encode(part));
            }
            controller.close();
        },
    });
    return new Response(body, { headers: { "content-type": "text/event-stream" } });
}

function captureFetch(parts: string[], options: { split?: boolean } = {}) {
    const requests: Record<string, unknown>[] = [];
    const fetchStub = async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        requests.push(JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>);
        return sseResponse(parts, options);
    };
    return { requests, fetchStub };
}

const tool = {
    name: "get_file_diff",
    description: "read a diff",
    parameters: { type: "object" },
    execute: async () => ({}),
};

describe("createOpenAiSender streaming", () => {
    test("requests a stream with usage and rebuilds content, tool calls and usage", async () => {
        const { requests, fetchStub } = captureFetch([
            chunkFrame({ delta: { role: "assistant", content: "The file " } }),
            chunkFrame({ delta: { content: "has an " } }),
            chunkFrame({ delta: { content: "off-by-one." } }),
            chunkFrame({
                delta: {
                    tool_calls: [
                        {
                            index: 0,
                            id: "call_1",
                            type: "function",
                            function: { name: "get_file_diff", arguments: '{"file' },
                        },
                    ],
                },
            }),
            chunkFrame({
                delta: { tool_calls: [{ index: 0, function: { arguments: 'Path":"a.ts"}' } }] },
            }),
            chunkFrame({
                delta: {
                    tool_calls: [
                        {
                            index: 1,
                            id: "call_2",
                            type: "function",
                            function: { name: "grep", arguments: '{"query":' },
                        },
                    ],
                },
            }),
            chunkFrame({ delta: { tool_calls: [{ index: 1, function: { arguments: '"lastN"}' } }] } }),
            chunkFrame({
                choices: [],
                usage: { prompt_tokens: 1234, completion_tokens: 56, prompt_tokens_details: { cached_tokens: 12 } },
            }),
            chunkFrame({ delta: {}, finishReason: "tool_calls" }),
            "data: [DONE]\n\n",
        ]);

        const sender = createOpenAiSender({
            apiKey: "test-key",
            baseURL: "https://gateway.example/v1",
            model: "opencode-go/deepseek-v4.1-flash",
            timeoutSecond: 600,
            reasoningEffort: "xhigh",
            fetch: fetchStub,
        });

        const result = await sender.send([{ role: "user", content: "review the pull request" }], [tool]);

        expect(requests).toHaveLength(1);
        expect(requests[0]?.stream).toBe(true);
        expect(requests[0]?.stream_options).toEqual({ include_usage: true });
        expect(requests[0]?.reasoning_effort).toBe("xhigh");
        expect(requests[0]?.model).toBe("opencode-go/deepseek-v4.1-flash");
        expect(requests[0]?.tool_choice).toBe("auto");

        expect(result.message.content).toBe("The file has an off-by-one.");
        expect(result.message.toolCalls).toEqual([
            { id: "call_1", name: "get_file_diff", arguments: '{"filePath":"a.ts"}' },
            { id: "call_2", name: "grep", arguments: '{"query":"lastN"}' },
        ]);
        expect(result.finishReason).toBe("tool_calls");
        expect(result.requestId).toBe("chatcmpl-test");
        expect(result.usage).toEqual({ inputToken: 1234, outputToken: 56, cachedInputToken: 12 });
    });

    test("keeps the same result when a frame is split across reads", async () => {
        const parts = [
            chunkFrame({ delta: { content: "split frame works" } }),
            chunkFrame({ delta: {}, finishReason: "stop" }),
            "data: [DONE]\n\n",
        ];
        const { fetchStub } = captureFetch(parts, { split: true });
        const sender = createOpenAiSender({
            apiKey: "test-key",
            baseURL: "https://gateway.example/v1",
            model: "m",
            timeoutSecond: 60,
            fetch: fetchStub,
        });

        const result = await sender.send([{ role: "user", content: "hi" }], []);
        expect(result.message.content).toBe("split frame works");
        expect(result.finishReason).toBe("stop");
    });

    test("ignores reasoning deltas and reports zero usage when the provider omits it", async () => {
        const { fetchStub } = captureFetch([
            chunkFrame({ delta: { reasoning_content: "let me think about the diff" } }),
            chunkFrame({ delta: { content: "answer" } }),
            chunkFrame({ delta: {}, finishReason: "stop" }),
            "data: [DONE]\n\n",
        ]);
        const sender = createOpenAiSender({
            apiKey: "test-key",
            baseURL: "https://gateway.example/v1",
            model: "m",
            timeoutSecond: 60,
            fetch: fetchStub,
        });

        const result = await sender.send([{ role: "user", content: "hi" }], []);
        expect(result.message.content).toBe("answer");
        expect(result.usage).toEqual({ inputToken: 0, outputToken: 0, cachedInputToken: 0 });
    });

    test("fails when the provider reports the error inside the stream", async () => {
        const { fetchStub } = captureFetch([
            chunkFrame({ error: { code: 429, message: "rate limit reached" } }),
            "data: [DONE]\n\n",
        ]);
        const sender = createOpenAiSender({
            apiKey: "test-key",
            baseURL: "https://gateway.example/v1",
            model: "m",
            timeoutSecond: 60,
            fetch: fetchStub,
        });

        const error = await sender.send([{ role: "user", content: "hi" }], []).catch((e: unknown) => e);
        expect((error as Error).message).toBe("rate limit reached");
    });

    test("fails when the stream ends without a finish reason", async () => {
        const { fetchStub } = captureFetch(["data: [DONE]\n\n"]);
        const sender = createOpenAiSender({
            apiKey: "test-key",
            baseURL: "https://gateway.example/v1",
            model: "m",
            timeoutSecond: 60,
            fetch: fetchStub,
        });

        await expect(sender.send([{ role: "user", content: "hi" }], [])).rejects.toThrow(
            "The model stream ended without a finish reason",
        );
    });
});

describe("accumulateChatCompletionStream", () => {
    async function* from(chunks: unknown[]): AsyncGenerator<OpenAI.Chat.ChatCompletionChunk> {
        for (const chunk of chunks) {
            yield chunk as OpenAI.Chat.ChatCompletionChunk;
        }
    }

    test("orders tool calls by index even when the provider interleaves them", async () => {
        const accumulated = await accumulateChatCompletionStream(
            from([
                {
                    id: "c1",
                    choices: [{ index: 0, delta: { tool_calls: [{ index: 2, id: "b", function: { name: "b" } }] } }],
                },
                { choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: "a", function: { name: "a" } }] } }] },
                { choices: [{ index: 0, delta: { tool_calls: [{ index: 2, function: { arguments: "{}" } }] } }] },
                { choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: "{}" } }] } }] },
            ]),
        );

        expect(accumulated.toolCalls).toEqual([
            { id: "a", name: "a", arguments: "{}" },
            { id: "b", name: "b", arguments: "{}" },
        ]);
        expect(accumulated.content).toBeNull();
    });

    test("keeps a partial tool call id and name from an earlier chunk", async () => {
        const accumulated = await accumulateChatCompletionStream(
            from([
                {
                    choices: [
                        { index: 0, delta: { tool_calls: [{ index: 0, id: "call_x", function: { name: "grep" } }] } },
                    ],
                },
                { choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: '{"q":1}' } }] } }] },
            ]),
        );

        expect(accumulated.toolCalls).toEqual([{ id: "call_x", name: "grep", arguments: '{"q":1}' }]);
    });
});

describe("createOpenAiSender OpenRouter errors", () => {
    test("throws the OpenRouter error message from an in-stream error frame", async () => {
        const { fetchStub } = captureFetch([
            chunkFrame({ error: { code: 429, message: "rate limit reached" } }),
            "data: [DONE]\n\n",
        ]);
        const sender = createOpenAiSender({
            apiKey: "test-key",
            baseURL: "https://openrouter.ai/api/v1",
            model: "m",
            timeoutSecond: 60,
            fetch: fetchStub,
        });

        const error = await sender.send([{ role: "user", content: "hi" }], []).catch((e: unknown) => e);
        expect((error as Error).message).toBe("rate limit reached");
        expect((error as { status?: number }).status).toBeUndefined();
    });
});
