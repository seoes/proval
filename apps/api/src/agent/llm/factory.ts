import type { ReasoningEffort } from "@proval/types";
import type { LlmSender } from "./loop.js";
import { createOpenAiSender } from "./openai.js";
import { createAnthropicSender } from "./anthropic.js";
import { loadLimiter, type Limiter } from "./concurrency.js";

export interface SenderConfig {
    provider: string;
    apiKey: string;
    baseURL: string;
    model: string;
    timeoutSecond: number;
    reasoningEffort?: ReasoningEffort;
    modelProviderId?: number;
    concurrency?: number | null;
}

export type SenderSDKConfig = Omit<SenderConfig, "provider" | "modelProviderId" | "concurrency"> & {
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

function withConcurrencyLimit(sender: LlmSender, limiter: Limiter): LlmSender {
    return {
        send: (messages, tools) => limiter.run(() => sender.send(messages, tools)),
        getModel: () => sender.getModel(),
    };
}

export function createSender(config: SenderConfig): LlmSender {
    const { modelProviderId, concurrency, ...sdkConfig } = config;
    const limiter = loadLimiter(modelProviderId, concurrency);
    const fetch = createLLMFetch();
    switch (config.provider) {
        case "anthropic":
            return withConcurrencyLimit(createAnthropicSender({ ...sdkConfig, fetch }), limiter);
        case "openai":
        default:
            return withConcurrencyLimit(createOpenAiSender({ ...sdkConfig, fetch }), limiter);
    }
}
