import type { ReasoningEffort } from "@proval/types";
import OpenAI from "openai";
import type { LlmSender } from "./loop.js";
import { createOpenAiResponsesSender } from "./openai-responses.js";

export const xaiBaseUrl = "https://api.x.ai/v1";
export const openAiOAuthBaseUrl = "https://chatgpt.com/backend-api/codex";
const apiMap = {
    [xaiBaseUrl]: { name: "xAI", reasoningEffortList: ["low", "medium", "high", "xhigh"] },
    [openAiOAuthBaseUrl]: { name: "OpenAI", reasoningEffortList: ["minimal", "low", "medium", "high", "xhigh"] },
};

type Fetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

// The ChatGPT account is a claim inside the OpenAI access token.
export function getChatGptAccountId(accessToken: string): string | undefined {
    try {
        const accountId = JSON.parse(Buffer.from(accessToken.split(".")[1] ?? "", "base64url").toString())?.[
            "https://api.openai.com/auth"
        ]?.chatgpt_account_id;
        return typeof accountId === "string" && accountId ? accountId : undefined;
    } catch {
        return undefined;
    }
}

interface OAuthSenderConfig {
    baseUrl: typeof xaiBaseUrl | typeof openAiOAuthBaseUrl;
    getAccessToken: (rejectedAccessToken?: string) => Promise<string>;
    timeoutSecond: number;
    fetch?: Fetch;
    model: string;
    reasoningEffort?: ReasoningEffort;
}

export function createOAuthFetch(config: Pick<OAuthSenderConfig, "baseUrl" | "getAccessToken" | "fetch">): Fetch {
    const request = config.fetch ?? ((input, init) => fetch(input, init));
    const base = new URL(config.baseUrl);

    return async (input, init) => {
        const url = new URL(input instanceof Request ? input.url : input.toString());
        if (
            url.origin !== base.origin ||
            (url.pathname !== base.pathname && !url.pathname.startsWith(`${base.pathname}/`)) ||
            url.username ||
            url.password
        ) {
            throw new Error(`Refusing to send ${apiMap[config.baseUrl].name} credentials to another address`);
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
            if (config.baseUrl === openAiOAuthBaseUrl) {
                const accountId = getChatGptAccountId(accessToken);
                if (!accountId) throw new Error("The OpenAI token has no ChatGPT account. Reconnect this provider");
                header.set("chatgpt-account-id", accountId);
                header.set("originator", "proval");
                header.set("OpenAI-Beta", "responses=experimental");
            }
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

export function createOAuthSender(config: OAuthSenderConfig): LlmSender {
    const { name, reasoningEffortList } = apiMap[config.baseUrl];
    const reasoningEffort = config.reasoningEffort === "none" ? undefined : config.reasoningEffort;
    if (reasoningEffort && !reasoningEffortList.includes(reasoningEffort)) {
        throw new Error(`This reasoning effort is not supported by ${name}. Select Default or a supported effort`);
    }

    const sender = createOpenAiResponsesSender({
        model: config.model,
        timeoutSecond: config.timeoutSecond,
        reasoningEffort,
        apiKey: "oauth",
        baseURL: config.baseUrl,
        fetch: createOAuthFetch(config),
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

export async function getOAuthModelList(
    config: Pick<OAuthSenderConfig, "baseUrl" | "getAccessToken" | "timeoutSecond" | "fetch">,
): Promise<{ id: string }[] | null> {
    const { name } = apiMap[config.baseUrl];
    const client = new OpenAI({
        apiKey: "oauth",
        baseURL: config.baseUrl,
        timeout: config.timeoutSecond * 1000,
        fetch: createOAuthFetch(config),
    });

    try {
        if (config.baseUrl === openAiOAuthBaseUrl) {
            // The Codex model catalog requires a Codex CLI client version.
            const body = await client.get<unknown, { models?: { slug: string; visibility?: string }[] }>("/models", {
                query: { client_version: "0.171.0" },
            });
            return (
                body.models?.filter((model) => model.visibility !== "hide").map((model) => ({ id: model.slug })) ?? null
            );
        }
        const page = await client.models.list();
        return page.data.map((model) => ({ id: model.id }));
    } catch (error) {
        const original = unwrapConnectionCause(error);
        if (
            original instanceof Error &&
            (original.name === "OAuthError" || original.message.startsWith(`Refusing to send ${name} credentials`))
        ) {
            throw original;
        }
        if (error instanceof OpenAI.APIError && [401, 403].includes(error.status ?? 0)) {
            throw new Error(
                `${name} denied model discovery. Check the account permission or enter a model ID manually`,
            );
        }
        return null;
    }
}
