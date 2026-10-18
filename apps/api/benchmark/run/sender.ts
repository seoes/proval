import type { AgentTool, LlmResponse, LlmSender, Message, ToolCall } from "../../src/agent/llm/loop.js";

/**
 * Deterministic sender used by tests and CI instead of a model endpoint.
 * Enabled with BENCHMARK_FAKE_SENDER = scripted | slow | fail.
 *
 * scripted walks the full review flow against the standard fixture repo whose
 * only changed file is src/a.ts. slow never resolves so cancellation behavior
 * can be verified. fail throws on the first request.
 */

function response(content: string | null, toolCallList: ToolCall[] = []): LlmResponse {
    return {
        message: {
            role: "assistant",
            content,
            toolCalls: toolCallList.length > 0 ? toolCallList : undefined,
        },
        finishReason: toolCallList.length > 0 ? "tool_calls" : "stop",
        requestId: "fake-request",
        usage: { inputToken: 100, outputToken: 10, cachedInputToken: 0 },
    };
}

function call(name: string, args: Record<string, unknown>): ToolCall {
    return { id: crypto.randomUUID(), name, arguments: JSON.stringify(args) };
}

function createScriptedSender(variant: "scripted" | "compress-once" | "plan-loop-forever" | "no-handoff"): LlmSender {
    let planRequestCount = 0;
    let writingRequestCount = 0;
    let compressThrown = false;
    const subDelayMs = Number.parseInt(process.env.BENCHMARK_FAKE_SUB_DELAY_MS ?? "0", 10) || 0;
    return {
        async send(_messageList: Message[], toolList: AgentTool[]): Promise<LlmResponse> {
            const nameList = toolList.map((tool) => tool.name);
            if (nameList.includes("append_review_unit")) {
                if (variant === "plan-loop-forever") {
                    return response(null, [call("list_directory", { path: "." })]);
                }
                if (variant === "compress-once" && !compressThrown && planRequestCount === 1) {
                    compressThrown = true;
                    throw new Error("context length exceeded (fake)");
                }
                planRequestCount++;
                if (planRequestCount === 1) {
                    return response(null, [
                        call("append_review_unit", {
                            files: ["src/a.ts"],
                            name: "unit a",
                            description: "first changed file",
                        }),
                    ]);
                }
                if (planRequestCount === 2) {
                    return response(null, [
                        call("append_review_unit", {
                            files: ["src/b.ts"],
                            name: "unit b",
                            description: "second changed file",
                        }),
                    ]);
                }
                return response("plan complete");
            }
            if (nameList.includes("submit_review_handoff")) {
                if (variant === "no-handoff") {
                    // Burn the step budget without ever submitting the handoff.
                    return response(null, [call("list_directory", { path: "." })]);
                }
                if (subDelayMs > 0) {
                    await new Promise((resolvePromise) => setTimeout(resolvePromise, subDelayMs));
                }
                return response(null, [call("submit_review_handoff", { findingList: [], goodPointList: [] })]);
            }
            if (nameList.includes("post_pull_request_comment")) {
                writingRequestCount++;
                if (writingRequestCount === 1) {
                    return response(null, [call("post_pull_request_comment", { body: "fake summary comment" })]);
                }
                return response(null, [call("evaluate_pull_request", { isGood: true })]);
            }
            return response("done");
        },
        getModel: () => ({ model: "fake-model", provider: "fake", baseUrl: "http://localhost" }),
    };
}

export function createFakeSender(kind: string): LlmSender {
    if (kind === "scripted" || kind === "compress-once" || kind === "plan-loop-forever" || kind === "no-handoff") {
        return createScriptedSender(kind);
    }
    if (kind === "slow") {
        return {
            send: () => new Promise<LlmResponse>(() => {}),
            getModel: () => ({ model: "fake-slow", provider: "fake", baseUrl: "http://localhost" }),
        };
    }
    if (kind === "fail") {
        return {
            send: () => Promise.reject(new Error("fake model failure")),
            getModel: () => ({ model: "fake-fail", provider: "fake", baseUrl: "http://localhost" }),
        };
    }
    throw new Error(`unknown fake sender kind: ${kind}`);
}
