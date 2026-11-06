import OpenAI from "openai";
import { Headers } from "openai/_shims/index.mjs";

export type ChatComplete = (system: string, user: string, timeoutMs: number) => Promise<string>;

export function createChatComplete(config: { apiKey: string; baseURL: string; model: string }): ChatComplete {
    const client = new OpenAI({
        apiKey: config.apiKey,
        baseURL: config.baseURL,
        // ponytail: SDK deadline sits above the per call abort. Raise it if a gateway is slower than the abort.
        timeout: 120_000,
    });
    const sessionId = crypto.randomUUID();
    // const headers = {};
    // if (config.baseURL.includes("opencode.ai")) {
    //     headers["x-opencode-session"] =
    //     // headers.set("x-opencode-session", crypto.randomUUID());
    // }
    return async (system, user, timeoutMs) => {
        const signal = AbortSignal.timeout(timeoutMs);
        const response = await client.chat.completions.create(
            {
                model: config.model,
                temperature: 0,
                messages: [
                    { role: "system", content: system },
                    { role: "user", content: user },
                ],
            },
            {
                signal,
                headers: { "x-opencode-session": config.baseURL.includes("opencode.ai") ? sessionId : undefined },
            },
        );
        return response.choices[0]?.message?.content?.trim() ?? "";
    };
}

export function isRateLimitError(error: unknown): boolean {
    if (error instanceof OpenAI.APIError && error.status === 429) return true;
    const text = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
    return text.includes("429") || text.includes("rate") || text.includes("too many");
}

export function isTimeoutError(error: unknown): boolean {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "APIConnectionTimeoutError"))
        return true;
    const text = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
    return text.includes("timeout") || text.includes("timed out");
}

export function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
