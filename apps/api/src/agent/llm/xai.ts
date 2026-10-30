import type { ReasoningEffort } from "@proval/types";
import OpenAI from "openai";
import type { LlmSender } from "./loop.js";
import { createOpenAiResponsesSender } from "./openai-responses.js";

export const xaiBaseUrl = "https://api.x.ai/v1";
const reasoningEffortList = ["low", "medium", "high", "xhigh"];

type Fetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

interface XaiSenderConfig {
    getAccessToken: (rejectedAccessToken?: string) => Promise<string>;
    timeoutSecond: number;
    fetch?: Fetch;
    model: string;
    reasoningEffort?: ReasoningEffort;
}

export function createXaiFetch(config: { getAccessToken: XaiSenderConfig["getAccessToken"]; fetch?: Fetch }): Fetch {
    const request = config.fetch ?? ((input, init) => fetch(input, init));

    return async (input, init) => {
        const url = new URL(input instanceof Request ? input.url : input.toString());
        if (
            url.origin !== "https://api.x.ai" ||
            (url.pathname !== "/v1" && !url.pathname.startsWith("/v1/")) ||
            url.username ||
            url.password
        ) {
            throw new Error("Refusing to send xAI credentials to another address");
        }

        const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
        const resolveAccessToken = async (rejected?: string) => {
            signal?.throwIfAborted();
            const promise = config.getAccessToken(rejected);
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

function unwrapConnectionCause(error: unknown): unknown {
    if (error instanceof OpenAI.APIConnectionError && error.cause instanceof Error) return error.cause;
    return error;
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
        apiKey: "oauth",
        baseURL: xaiBaseUrl,
        fetch: createXaiFetch(config),
    });

    return {
        ...sender,
        getModel() {
            return { ...sender.getModel(), reasoningEffort: config.reasoningEffort };
        },
        async send(...argumentList: Parameters<LlmSender["send"]>) {
            try {
                return await sender.send(...argumentList);
            } catch (error) {
                throw unwrapConnectionCause(error);
            }
        },
    };
}

export async function getXaiModelList(config: {
    getAccessToken: XaiSenderConfig["getAccessToken"];
    timeoutSecond: number;
    fetch?: Fetch;
}): Promise<{ id: string }[] | null> {
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
        const original = unwrapConnectionCause(error);
        if (
            original instanceof Error &&
            (original.name === "XaiOAuthError" || original.message.startsWith("Refusing to send xAI credentials"))
        ) {
            throw original;
        }
        if (error instanceof OpenAI.APIError && [401, 403].includes(error.status ?? 0)) {
            throw new Error("xAI denied model discovery. Check the account permission or enter a model ID manually");
        }
        return null;
    }
}
