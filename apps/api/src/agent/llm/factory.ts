import type { ReasoningEffort } from "@proval/types";
import type { LlmSender } from "./loop.js";
import { createOpenAiSender } from "./openai.js";
import { createOpenAiResponsesSender } from "./openai-responses.js";
import { createAnthropicSender } from "./anthropic.js";
import { createXaiSender, type XaiSenderConfig } from "./xai.js";

export interface SenderSDKConfig {
    apiKey: string;
    baseURL: string;
    model: string;
    timeoutSecond: number;
    maxOutputToken?: number;
    reasoningEffort?: ReasoningEffort;
    fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
    maxRetries?: number;
}

export type SenderConfig =
    | (Omit<SenderSDKConfig, "fetch"> & {
          provider: "openai" | "openai_responses" | "anthropic";
          fetch?: SenderSDKConfig["fetch"];
      })
    | (XaiSenderConfig & { provider: "xai" });

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
    if (config.provider === "xai") return createXaiSender(config);

    const fetch = config.fetch ?? createLLMFetch();
    switch (config.provider) {
        case "openai_responses":
            return createOpenAiResponsesSender({ ...config, fetch });
        case "anthropic":
            return createAnthropicSender({ ...config, fetch });
        case "openai":
        default:
            return createOpenAiSender({ ...config, fetch });
    }
}
