import type { ReasoningEffort } from "@proval/types";
import type { LlmSender } from "./loop.js";
import { createOpenAiSender } from "./openai.js";
import { createOpenAiResponsesSender } from "./openai-responses.js";
import { createAnthropicSender } from "./anthropic.js";
import { createXaiSender } from "./xai.js";
import { loadLimiter, type Limiter } from "./concurrency.js";

export interface SenderConfig {
    provider: "openai" | "openai_responses" | "anthropic" | "xai";
    apiKey: string;
    baseURL: string;
    model: string;
    timeoutSecond: number;
    maxOutputToken?: number;
    reasoningEffort?: ReasoningEffort;
    maxRetries?: number;
    modelProviderId?: number;
    concurrency?: number | null;
    getAccessToken?: (rejectedAccessToken?: string) => Promise<string>;
}

export type SenderSDKConfig = Omit<SenderConfig, "provider" | "modelProviderId" | "concurrency" | "getAccessToken"> & {
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
    const { modelProviderId, concurrency, provider, getAccessToken, ...sdkConfig } = config;
    const limiter = loadLimiter(modelProviderId, concurrency);
    if (provider === "xai") {
        if (!getAccessToken) throw new Error("xAI access token callback is missing");
        return withConcurrencyLimit(
            createXaiSender({
                getAccessToken,
                model: config.model,
                timeoutSecond: config.timeoutSecond,
                reasoningEffort: config.reasoningEffort,
            }),
            limiter,
        );
    }

    const fetch = createLLMFetch();
    const sdk = { ...sdkConfig, fetch };
    switch (provider) {
        case "openai_responses":
            return withConcurrencyLimit(createOpenAiResponsesSender(sdk), limiter);
        case "anthropic":
            return withConcurrencyLimit(createAnthropicSender(sdk), limiter);
        case "openai":
        default:
            return withConcurrencyLimit(createOpenAiSender(sdk), limiter);
    }
}
