import type { LlmSender } from "./loop.js";
import { createOpenAiSender } from "./openai.js";
import { createAnthropicSender } from "./anthropic.js";

export interface SenderConfig {
    provider: string;
    apiKey: string;
    baseURL: string;
    model: string;
    timeoutSecond: number;
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

export function createSender(config: SenderConfig): LlmSender {
    const fetch = createLLMFetch();
    switch (config.provider) {
        case "anthropic":
            return createAnthropicSender({ ...config, fetch });
        case "openai":
        default:
            return createOpenAiSender({ ...config, fetch });
    }
}
