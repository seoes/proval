import type { ReasoningEffort } from "@proval/types";
import type { LlmSender } from "./loop.js";
import { createOpenAiSender } from "./openai.js";
import { createAnthropicSender } from "./anthropic.js";
import { llmCallLimiter } from "./concurrency.js";

export interface SenderConfig {
    provider: string;
    apiKey: string;
    baseURL: string;
    model: string;
    timeoutSecond: number;
    reasoningEffort?: ReasoningEffort;
}

export type SenderSDKConfig = Omit<SenderConfig, "provider"> & {
    fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
};

// Bun applies a socket idle limit that fires while a slow model is still thinking.
// Disable it and let the SDK deadline own the timeout.
function createLLMFetch() {
    const sessionId = crypto.randomUUID();
    return (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const headers = new Headers(init?.headers ?? {});
        headers.set("x-opencode-session", sessionId);
        headers.set("User-Agent", "Proval");
        return fetch(input, { ...init, timeout: false, headers } as RequestInit);
    };
}

/**
 * Bounds every model call in the process, not just one agent kind.
 * A plan agent, a review sub agent, a writing agent and a reply agent all send
 * through a sender from here, so wrapping it here is the only place that holds
 * when several review run at once.
 */
function withConcurrencyLimit(sender: LlmSender): LlmSender {
    return {
        send: (messages, tools) => llmCallLimiter.run(() => sender.send(messages, tools)),
        getModel: () => sender.getModel(),
    };
}

export function createSender(config: SenderConfig): LlmSender {
    const fetch = createLLMFetch();
    switch (config.provider) {
        case "anthropic":
            return withConcurrencyLimit(createAnthropicSender({ ...config, fetch }));
        case "openai":
        default:
            return withConcurrencyLimit(createOpenAiSender({ ...config, fetch }));
    }
}
