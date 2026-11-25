import OpenAI from "openai";

export const oauthProviderMap = {
    xai_oauth: {
        name: "xAI",
        baseUrl: "https://api.x.ai/v1",
        clientId: "b1a00492-073a-47ea-816f-4c329264a828",
        tokenUrl: "https://auth.x.ai/oauth2/token",
        revokeUrl: "https://auth.x.ai/oauth2/revoke",
    },
    openai_oauth: {
        name: "OpenAI",
        baseUrl: "https://chatgpt.com/backend-api/codex",
        clientId: "app_EMoamEEZ73f0CkXaXp7hrann",
        tokenUrl: "https://auth.openai.com/oauth/token",
        revokeUrl: "https://auth.openai.com/oauth/revoke",
    },
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

interface OAuthConfig {
    method: keyof typeof oauthProviderMap;
    getAccessToken: (rejectedAccessToken?: string) => Promise<string>;
    timeoutSecond: number;
    fetch?: Fetch;
}

export function createOAuthFetch(config: Omit<OAuthConfig, "timeoutSecond">): Fetch {
    const request = config.fetch ?? ((input, init) => fetch(input, init));
    const base = new URL(oauthProviderMap[config.method].baseUrl);

    return async (input, init) => {
        const url = new URL(input instanceof Request ? input.url : input.toString());
        if (
            url.origin !== base.origin ||
            (url.pathname !== base.pathname && !url.pathname.startsWith(`${base.pathname}/`)) ||
            url.username ||
            url.password
        ) {
            throw new Error(`Refusing to send ${oauthProviderMap[config.method].name} credentials to another address`);
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
            if (config.method === "openai_oauth") {
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

export function unwrapConnectionCause(error: unknown): unknown {
    if (error instanceof OpenAI.APIConnectionError && error.cause instanceof Error) return error.cause;
    return error;
}

export async function getOAuthModelList(config: OAuthConfig): Promise<{ id: string }[] | null> {
    const { name, baseUrl } = oauthProviderMap[config.method];
    const client = new OpenAI({
        apiKey: "oauth",
        baseURL: baseUrl,
        timeout: config.timeoutSecond * 1000,
        fetch: createOAuthFetch(config),
    });

    try {
        if (config.method === "openai_oauth") {
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
