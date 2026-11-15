import { afterEach, describe, expect, test } from "bun:test";
import { classifyModelError } from "./retryable-error.js";
import { createOpenAiSender, modelIdleTimeoutMs } from "./openai.js";

const encoder = new TextEncoder();
const frame = (delta: Record<string, unknown>, finish: string | null = null) =>
    `data: ${JSON.stringify({ id: "c1", object: "chat.completion.chunk", created: 0, model: "m", choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`;

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

const sender = (fetchImpl: ReturnType<typeof slowFetch>) =>
    createOpenAiSender({ apiKey: "k", baseURL: "https://gateway.example/v1", model: "m", timeoutSecond: 30, fetch: fetchImpl });

describe("stream idle timeout", () => {
    afterEach(() => {
        delete process.env.PROVAL_MODEL_IDLE_TIMEOUT_SECOND;
    });

    test("defaults to 240s and never exceeds the call timeout", () => {
        expect(modelIdleTimeoutMs(600, {})).toBe(240_000);
        expect(modelIdleTimeoutMs(120, {})).toBe(120_000);
        expect(modelIdleTimeoutMs(600, { PROVAL_MODEL_IDLE_TIMEOUT_SECOND: "90" })).toBe(90_000);
    });

    test("a stream that goes silent fails fast with a retryable timeout", async () => {
        process.env.PROVAL_MODEL_IDLE_TIMEOUT_SECOND = "1";
        const started = Date.now();
        const error = await sender(slowFetch([frame({ content: "thinking" })], 10, false))
            .send([{ role: "user", content: "hi" }], [])
            .catch((e: unknown) => e);
        expect(Date.now() - started).toBeLessThan(5_000);
        expect(String((error as Error).message)).toContain("no stream data for 1s");
        expect(classifyModelError(error)).toBe("transient");
    });

    test("a slow stream that keeps sending is not cut off", async () => {
        process.env.PROVAL_MODEL_IDLE_TIMEOUT_SECOND = "1";
        const frames = [frame({ content: "a" }), frame({ content: "b" }), frame({ content: "c" }), frame({}, "stop")];
        const result = await sender(slowFetch(frames, 600, true)).send([{ role: "user", content: "hi" }], []);
        expect(result.message.content).toBe("abc");
    });
});
