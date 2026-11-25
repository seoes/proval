import type { ReasoningEffort } from "@proval/types";
import OpenAI from "openai";
import type { AgentTool, LlmResponse, LlmSender, Message } from "./loop.js";
import { createOpenAiRequest } from "./openai.js";
import { createOpenAiResponsesRequest } from "./openai-responses.js";
import { createAnthropicRequest } from "./anthropic.js";
import { createOAuthFetch, unwrapConnectionCause, type oauthProviderMap } from "./oauth.js";
import { loadLimiter, type Limiter } from "./concurrency.js";

export interface SenderConfig {
    provider: "openai" | "openai_responses" | "anthropic";
    apiKey: string;
    baseURL: string;
    model: string;
    timeoutSecond: number;
    maxOutputToken?: number;
    reasoningEffort?: ReasoningEffort;
    modelProviderId?: number;
    concurrency?: number | null;
    // Set for OAuth providers. Requests then authenticate with the access token instead of apiKey.
    oauth?: {
        method: keyof typeof oauthProviderMap;
        getAccessToken: (rejectedAccessToken?: string) => Promise<string>;
    };
}

export type SenderSDKConfig = Omit<SenderConfig, "provider" | "modelProviderId" | "concurrency" | "oauth"> & {
    fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
};

// One model call in a specific API format. Call touch on every stream event to keep the idle timeout alive.
export type SenderRequest = (
    messageList: Message[],
    toolList: AgentTool[],
    stream: { signal: AbortSignal; touch: () => void },
) => Promise<LlmResponse>;

// Bun applies a socket idle limit that fires while a slow model is still thinking.
// Disable it and let the SDK deadline own the timeout.
function createLLMFetch(baseURL: string) {
    // Only OpenCode needs a session id. Other providers never see it.
    const sessionId = new URL(baseURL).hostname.endsWith("opencode.ai") ? crypto.randomUUID() : null;
    return (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const headers = new Headers(init?.headers ?? {});
        if (sessionId) headers.set("x-opencode-session", sessionId);
        headers.set("User-Agent", "Proval");
        return fetch(input, { ...init, timeout: false, headers } as RequestInit);
    };
}

export class Sender implements LlmSender {
    private readonly limiter: Limiter;
    private readonly request: SenderRequest;

    constructor(private readonly config: SenderConfig) {
        const { provider, modelProviderId, concurrency, oauth, ...sdkConfig } = config;
        this.limiter = loadLimiter(modelProviderId, concurrency);
        const fetch = oauth ? createOAuthFetch(oauth) : createLLMFetch(config.baseURL);
        const createRequest = {
            openai: createOpenAiRequest,
            openai_responses: createOpenAiResponsesRequest,
            anthropic: createAnthropicRequest,
        }[provider];
        this.request = createRequest({ ...sdkConfig, fetch });
    }

    public send(messageList: Message[], toolList: AgentTool[]): Promise<LlmResponse> {
        return this.limiter.run(async () => {
            const { signal, touch, clear } = this.createIdleTimeout();
            try {
                return await this.request(messageList, toolList, { signal, touch });
            } catch (error) {
                if (signal.aborted) {
                    throw new OpenAI.APIConnectionTimeoutError({
                        message: `Request timed out: no stream data for ${this.config.timeoutSecond}s.`,
                    });
                }
                throw this.config.oauth ? unwrapConnectionCause(error) : error;
            } finally {
                clear();
            }
        });
    }

    // Aborts a streamed model call once it has sent nothing for timeoutSecond. Call touch on every stream event.
    private createIdleTimeout() {
        const controller = new AbortController();
        let timer: ReturnType<typeof setTimeout> | undefined;
        const touch = () => {
            clearTimeout(timer);
            timer = setTimeout(() => controller.abort(), this.config.timeoutSecond * 1000);
        };
        touch();
        return { signal: controller.signal, touch, clear: () => clearTimeout(timer) };
    }

    public getModel() {
        return {
            model: this.config.model,
            provider: this.config.provider,
            baseUrl: this.config.baseURL,
            reasoningEffort: this.config.reasoningEffort,
        };
    }
}
