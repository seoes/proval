import { describe, expect, test } from "bun:test";
import { createAnthropicSender } from "./anthropic.js";
import { classifyModelError } from "./retryable-error.js";
import { createOpenAiSender } from "./openai.js";
import { createOpenAiResponsesSender } from "./openai-responses.js";

const encoder = new TextEncoder();
const timeoutSecond = 1;
const sdkBase = {
    apiKey: "k",
    baseURL: "https://gateway.example/v1",
    model: "m",
    timeoutSecond,
};

const chatFrame = (delta: Record<string, unknown>, finish: string | null = null) =>
    `data: ${JSON.stringify({ id: "c1", object: "chat.completion.chunk", created: 0, model: "m", choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`;

const responsesCreated = () =>
    `event: response.created\ndata: ${JSON.stringify({ type: "response.created", response: { id: "r1" } })}\n\n`;

const responsesCompleted = (text: string) =>
    `event: response.completed\ndata: ${JSON.stringify({
        type: "response.completed",
        response: {
            id: "resp_1",
            status: "completed",
            output: [
                {
                    type: "message",
                    id: "msg_1",
                    role: "assistant",
                    status: "completed",
                    content: [{ type: "output_text", text, annotations: [] }],
                },
            ],
            usage: { input_tokens: 1, output_tokens: 1 },
        },
    })}\n\n`;

function anthropicSse(payload: Record<string, unknown>) {
    return `event: ${payload.type}\ndata: ${JSON.stringify(payload)}\n\n`;
}

function anthropicTextFrameList(text: string): string[] {
    const message = {
        id: "msg_1",
        type: "message",
        role: "assistant",
        model: "m",
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 1, output_tokens: 0 },
    };
    const frameList = [
        anthropicSse({ type: "message_start", message }),
        anthropicSse({
            type: "content_block_start",
            index: 0,
            content_block: { type: "text", text: "" },
        }),
        ...[...text].map((ch) =>
            anthropicSse({
                type: "content_block_delta",
                index: 0,
                delta: { type: "text_delta", text: ch },
            }),
        ),
        anthropicSse({ type: "content_block_stop", index: 0 }),
        anthropicSse({
            type: "message_delta",
            delta: { stop_reason: "end_turn", stop_sequence: null },
            usage: { output_tokens: text.length },
        }),
        anthropicSse({ type: "message_stop" }),
    ];
    return frameList;
}

/** A stream that sends the given frames, each after `gapMs`, then hangs unless closed. */
function slowFetch(frames: string[], gapMs: number, close: boolean) {
    return async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const body = new ReadableStream<Uint8Array>({
            async start(controller) {
                init?.signal?.addEventListener("abort", () => controller.error(new DOMException("aborted", "AbortError")));
                for (const f of frames) {
                    await new Promise((r) => setTimeout(r, gapMs));
                    controller.enqueue(encoder.encode(f));
                }
                if (close) controller.close();
            },
        });
        return new Response(body, { headers: { "content-type": "text/event-stream" } });
    };
}

async function expectSilentTimeout(send: () => Promise<unknown>) {
    const started = Date.now();
    const error = await send().catch((e: unknown) => e);
    expect(Date.now() - started).toBeLessThan(5_000);
    expect(String((error as Error).message)).toContain("no stream data for 1s");
    expect(classifyModelError(error)).toBe("transient");
}

describe("stream idle timeout", () => {
    describe("openai chat completions", () => {
        const sender = (fetchImpl: ReturnType<typeof slowFetch>) => createOpenAiSender({ ...sdkBase, fetch: fetchImpl });

        test("a stream that goes silent fails fast with a retryable timeout", async () => {
            await expectSilentTimeout(() =>
                sender(slowFetch([chatFrame({ content: "thinking" })], 10, false)).send([{ role: "user", content: "hi" }], []),
            );
        });

        test("a slow stream that keeps sending is not cut off", async () => {
            const frames = [chatFrame({ content: "a" }), chatFrame({ content: "b" }), chatFrame({ content: "c" }), chatFrame({}, "stop")];
            const result = await sender(slowFetch(frames, 600, true)).send([{ role: "user", content: "hi" }], []);
            expect(result.message.content).toBe("abc");
        });
    });

    describe("openai responses", () => {
        const sender = (fetchImpl: ReturnType<typeof slowFetch>) => createOpenAiResponsesSender({ ...sdkBase, fetch: fetchImpl });

        test("a stream that goes silent fails fast with a retryable timeout", async () => {
            await expectSilentTimeout(() =>
                sender(slowFetch([responsesCreated()], 10, false)).send([{ role: "user", content: "hi" }], []),
            );
        });

        test("a slow stream that keeps sending is not cut off", async () => {
            const frames = [
                responsesCreated(),
                responsesCreated(),
                responsesCreated(),
                responsesCompleted("abc"),
            ];
            const result = await sender(slowFetch(frames, 600, true)).send([{ role: "user", content: "hi" }], []);
            expect(result.message.content).toBe("abc");
        });
    });

    describe("anthropic", () => {
        const sender = (fetchImpl: ReturnType<typeof slowFetch>) => createAnthropicSender({ ...sdkBase, fetch: fetchImpl });

        test("a stream that goes silent fails fast with a retryable timeout", async () => {
            const startOnly = [anthropicSse({ type: "message_start", message: { id: "msg_1", type: "message", role: "assistant", model: "m", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 0 } } })];
            await expectSilentTimeout(() => sender(slowFetch(startOnly, 10, false)).send([{ role: "user", content: "hi" }], []));
        });

        test("a slow stream that keeps sending is not cut off", async () => {
            const result = await sender(slowFetch(anthropicTextFrameList("abc"), 600, true)).send(
                [{ role: "user", content: "hi" }],
                [],
            );
            expect(result.message.content).toBe("abc");
        });
    });
});