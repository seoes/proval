import OpenAI from "openai";
import type { SenderSDKConfig } from "./factory.js";
import type { LlmSender } from "./loop.js";
import { createOpenAiResponsesSender } from "./openai-responses.js";

export const xaiBaseUrl = "https://api.x.ai/v1";
const reasoningEffortList = ["low", "medium", "high", "xhigh"];

interface XaiConnectionConfig {
    getAccessToken: (rejectedAccessToken?: string) => Promise<string>;
    timeoutSecond: number;
    fetch?: SenderSDKConfig["fetch"];
}

export interface XaiSenderConfig extends XaiConnectionConfig {
    model: string;
    reasoningEffort?: SenderSDKConfig["reasoningEffort"];
}

// Keep credential failures identifiable when the SDK wraps a fetch error.
class XaiCredentialError extends Error {}

function unwrapXaiError(error: unknown) {
    if (error instanceof OpenAI.APIConnectionError && error.cause instanceof XaiCredentialError) {
        return error.cause.cause;
    }
    return error;
}

export function createXaiFetch(
    config: Pick<XaiConnectionConfig, "getAccessToken" | "fetch">,
): SenderSDKConfig["fetch"] {
    const request = config.fetch ?? ((input, init) => fetch(input, init));
    const getAccessToken = async (rejected?: string) => {
        try {
            return await config.getAccessToken(rejected);
        } catch (cause) {
            throw new XaiCredentialError("xAI authentication failed", { cause });
        }
    };

    return async (input, init) => {
        const url = new URL(input instanceof Request ? input.url : input.toString());
        if (url.origin !== "https://api.x.ai" || !url.pathname.startsWith("/v1/") || url.username || url.password) {
            throw new Error("Refusing to send xAI credentials to another address");
        }
        const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
        const resolveAccessToken = async (rejected?: string) => {
            signal?.throwIfAborted();
            const promise = getAccessToken(rejected);
            if (!signal) return promise;
            return new Promise<string>((resolve, reject) => {
                const abort = () => reject(signal.reason);
                signal.addEventListener("abort", abort, { once: true });
                promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
                if (signal.aborted) abort();
            });
        };
        const send = (accessToken: string) => {
            signal?.throwIfAborted();
            const header = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
            header.set("Authorization", `Bearer ${accessToken}`);
            header.set("User-Agent", "Proval");
            return request(input instanceof Request ? input.clone() : input, {
                ...init,
                headers: header,
                redirect: "error",
                timeout: false,
            } as RequestInit);
        };
        const accessToken = await resolveAccessToken();
        const response = await send(accessToken);
        if (response.status !== 401) return response;

        await response.body?.cancel();
        return send(await resolveAccessToken(accessToken));
    };
}

export function createXaiSender(config: XaiSenderConfig): LlmSender {
    const reasoningEffort = config.reasoningEffort === "none" ? undefined : config.reasoningEffort;
    if (reasoningEffort && !reasoningEffortList.includes(reasoningEffort)) {
        throw new Error("This reasoning effort is not supported by xAI. Select Default or a supported effort");
    }

    const sender = createOpenAiResponsesSender({
        model: config.model,
        timeoutSecond: config.timeoutSecond,
        reasoningEffort,
        // The authenticated fetch replaces this SDK placeholder before sending.
        apiKey: "oauth",
        baseURL: xaiBaseUrl,
        fetch: createXaiFetch(config),
    });

    return {
        ...sender,
        async send(...argumentList: Parameters<LlmSender["send"]>) {
            try {
                return await sender.send(...argumentList);
            } catch (error) {
                throw unwrapXaiError(error);
            }
        },
    };
}

export async function getXaiModelList(config: XaiConnectionConfig): Promise<{ id: string }[] | null> {
    const client = new OpenAI({
        apiKey: "oauth",
        baseURL: xaiBaseUrl,
        timeout: config.timeoutSecond * 1000,
        fetch: createXaiFetch(config),
    });

    try {
        const page = await client.models.list();
        return page.data.map((model) => ({ id: model.id }));
    } catch (error) {
        const original = unwrapXaiError(error);
        if (original !== error) throw original;
        if (error instanceof OpenAI.APIError && [401, 403].includes(error.status ?? 0)) {
            throw new Error("xAI denied model discovery. Check the account permission or enter a model ID manually");
        }
        return null;
    }
}
