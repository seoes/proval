import type { LlmSender } from "./loop.js";
import { createOpenAiSender } from "./openai.js";
import { createAnthropicSender } from "./anthropic.js";

export interface SenderConfig {
    provider: string;
    apiKey: string;
    baseURL: string;
    model: string;
}

export function createSender(config: SenderConfig): LlmSender {
    switch (config.provider) {
        case "anthropic":
            return createAnthropicSender(config);
        case "openai":
        default:
            return createOpenAiSender(config);
    }
}
