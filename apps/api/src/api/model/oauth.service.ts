import { modelProviderTable } from "@proval/db";
import type { OAuthAttemptInput, OAuthAttemptResponse } from "@proval/types";
import { and, eq } from "drizzle-orm";
import { setTimeout as delay } from "node:timers/promises";
import db from "../../db/index.js";
import { decrypt, encrypt } from "../../util/encrypt.js";
import { getChatGptAccountId, openAiOAuthBaseUrl, xaiBaseUrl } from "../../agent/llm/oauth.js";
import { z } from "zod";

const oauthAttemptSchema = z
    .object({
        authMethod: z.enum(["xai_oauth", "openai_oauth"]),
        label: z.string().trim().min(1).max(200),
        timeoutSecond: z.number().int().min(10).max(7200),
        requestConcurrency: z.number().int().min(1).nullable().optional(),
        activityConcurrency: z.number().int().min(1).nullable().optional(),
        modelProviderId: z.number().int().positive().optional(),
    })
    .strict();

const openAiAuthUrl = "https://auth.openai.com";
const providerMap = {
    xai_oauth: {
        name: "xAI",
        clientId: "b1a00492-073a-47ea-816f-4c329264a828",
        tokenUrl: "https://auth.x.ai/oauth2/token",
        revokeUrl: "https://auth.x.ai/oauth2/revoke",
        baseUrl: xaiBaseUrl,
    },
    openai_oauth: {
        name: "OpenAI",
        clientId: "app_EMoamEEZ73f0CkXaXp7hrann",
        tokenUrl: `${openAiAuthUrl}/oauth/token`,
        revokeUrl: `${openAiAuthUrl}/oauth/revoke`,
        baseUrl: openAiOAuthBaseUrl,
    },
};
type OAuthMethod = keyof typeof providerMap;

// OpenAI and xAI report OAuth errors either as a plain string or as { code }.
function errorCode(data: Record<string, unknown>) {
    return typeof data.error === "object" && data.error ? (data.error as { code?: unknown }).code : data.error;
}

type Credential = {
    clientId: string;
    accessToken: string;
    refreshToken: string;
    expiresAt: number | null;
};

type Attempt = {
    owner: string;
    input: OAuthAttemptInput;
    response: OAuthAttemptResponse;
    abort: AbortController;
    originalCredential: string | null;
};

export class OAuthError extends Error {
    constructor(
        message: string,
        public readonly status: 400 | 403 | 404 | 409 | 429 | 502 = 400,
    ) {
        super(message);
        this.name = "OAuthError";
    }
}

export class OAuthService {
    private readonly attemptMap = new Map<string, Attempt>();
    private readonly startingOwnerSet = new Set<string>();
    private readonly refreshMap = new Map<number, Promise<Credential>>();

    constructor(
        private readonly request: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> = (input, init) =>
            fetch(input, init),
        private readonly wait = (ms: number, signal: AbortSignal) => delay(ms, undefined, { signal }),
    ) {}

    private async form(url: string, body: Record<string, string>, signal?: AbortSignal, json = false) {
        const response = await this.request(url, {
            method: "POST",
            headers: {
                "Content-Type": json ? "application/json" : "application/x-www-form-urlencoded",
                "User-Agent": "Proval",
            },
            body: json ? JSON.stringify(body) : new URLSearchParams(body).toString(),
            redirect: "error",
            signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000),
        });

        const data = await response.json().catch(() => null);
        if (!data || typeof data !== "object" || Array.isArray(data)) {
            // OpenAI answers a pending device poll with a bodyless 403 or 404.
            if (!response.ok) return { response, data: {} as Record<string, unknown> };
            throw new OAuthError("The provider returned an invalid authorization response", 502);
        }

        return { response, data: data as Record<string, unknown> };
    }

    private credential(data: Record<string, unknown>, clientId: string, previous?: Credential): Credential {
        const accessToken = data.access_token;
        const refreshToken = data.refresh_token ?? previous?.refreshToken;
        if (
            typeof accessToken !== "string" ||
            !accessToken ||
            typeof refreshToken !== "string" ||
            !refreshToken ||
            (data.token_type !== undefined && String(data.token_type).toLowerCase() !== "bearer")
        ) {
            throw new OAuthError("The provider did not return a usable renewable credential", 502);
        }

        const expiresAt =
            typeof data.expires_in === "number" && Number.isFinite(data.expires_in) && data.expires_in > 0
                ? Date.now() + data.expires_in * 1000
                : null;

        return { clientId, accessToken, refreshToken, expiresAt };
    }

    public async start(owner: string, input: unknown): Promise<OAuthAttemptResponse> {
        const attemptInput = oauthAttemptSchema.parse(input);
        const { name, clientId } = providerMap[attemptInput.authMethod];
        if (this.startingOwnerSet.has(owner)) throw new OAuthError("Authorization is already starting", 409);
        if (this.attemptMap.size + this.startingOwnerSet.size >= 256) {
            throw new OAuthError("Too many authorization attempts. Try again later", 429);
        }

        let originalCredential: string | null = null;
        if (attemptInput.modelProviderId !== undefined) {
            const provider = this.provider(attemptInput.modelProviderId);
            if (provider.authMethod !== attemptInput.authMethod) throw new OAuthError("OAuth provider not found", 404);
            originalCredential = provider.oauthCredential;
        }

        for (const attempt of this.attemptMap.values()) {
            if (attempt.owner === owner && attempt.response.status === "pending") this.finish(attempt, "cancelled");
        }

        this.startingOwnerSet.add(owner);
        try {
            const isOpenAi = attemptInput.authMethod === "openai_oauth";
            const { response, data } = isOpenAi
                ? await this.form(
                      `${openAiAuthUrl}/api/accounts/deviceauth/usercode`,
                      { client_id: clientId },
                      undefined,
                      true,
                  )
                : await this.form("https://auth.x.ai/oauth2/device/code", {
                      client_id: clientId,
                      scope: "openid profile email offline_access grok-cli:access api:access",
                      referrer: "proval",
                  });
            if (!response.ok) throw new OAuthError(`${name} could not start device authorization`, 502);

            // OpenAI sends no expiry and a string interval. Codex CLI waits 15 minutes for approval.
            const expiresIn = isOpenAi ? 900 : data.expires_in;
            const deviceCode = isOpenAi ? data.device_auth_id : data.device_code;
            if (
                typeof deviceCode !== "string" ||
                !deviceCode ||
                typeof data.user_code !== "string" ||
                typeof expiresIn !== "number" ||
                !Number.isFinite(expiresIn) ||
                expiresIn <= 0
            ) {
                throw new OAuthError(`${name} returned an invalid device code`, 502);
            }

            const verificationUri = new URL(
                isOpenAi
                    ? `${openAiAuthUrl}/codex/device`
                    : String(data.verification_uri_complete ?? data.verification_uri),
            );
            if (
                verificationUri.protocol !== "https:" ||
                !["accounts.x.ai", "auth.x.ai", "auth.openai.com"].includes(verificationUri.hostname)
            ) {
                throw new OAuthError(`${name} returned an unexpected verification address`, 502);
            }

            const attempt: Attempt = {
                owner,
                input: attemptInput,
                originalCredential,
                abort: new AbortController(),
                response: {
                    id: crypto.randomUUID(),
                    status: "pending",
                    userCode: data.user_code,
                    label: attemptInput.label,
                    timeoutSecond: attemptInput.timeoutSecond,
                    requestConcurrency: attemptInput.requestConcurrency ?? null,
                    activityConcurrency: attemptInput.activityConcurrency ?? null,
                    verificationUri: verificationUri.href,
                    expiresAt: Date.now() + expiresIn * 1000,
                },
            };
            this.attemptMap.set(attempt.response.id, attempt);

            const interval = Number(data.interval) > 0 ? Number(data.interval) * 1000 : 5000;
            void this.poll(
                attempt,
                isOpenAi
                    ? { device_auth_id: deviceCode, user_code: data.user_code }
                    : {
                          client_id: clientId,
                          device_code: deviceCode,
                          grant_type: "urn:ietf:params:oauth:grant-type:device_code",
                      },
                interval,
            );

            return { ...attempt.response };
        } finally {
            this.startingOwnerSet.delete(owner);
        }
    }

    public get(owner: string, id: string): OAuthAttemptResponse {
        const attempt = this.findAttempt(owner, id);
        if (attempt.response.status === "pending" && Date.now() >= attempt.response.expiresAt)
            this.finish(attempt, "expired");

        return { ...attempt.response };
    }

    public cancel(owner: string, id: string): OAuthAttemptResponse {
        const attempt = this.findAttempt(owner, id);
        if (attempt.response.status === "pending") this.finish(attempt, "cancelled");

        return { ...attempt.response };
    }

    private findAttempt(owner: string, id: string): Attempt {
        const attempt = this.attemptMap.get(id);
        if (attempt?.owner !== owner) throw new OAuthError("Authorization attempt not found. Start again", 404);

        return attempt;
    }

    private finish(attempt: Attempt, status: OAuthAttemptResponse["status"], error?: string) {
        if (attempt.response.status !== "pending") return;

        attempt.response.status = status;
        attempt.response.error = error;
        attempt.abort.abort();
        setTimeout(() => this.attemptMap.delete(attempt.response.id), 600000).unref();
    }

    private async poll(attempt: Attempt, pollBody: Record<string, string>, interval: number) {
        const { authMethod } = attempt.input;
        const { name, clientId, tokenUrl, baseUrl } = providerMap[authMethod];
        const isOpenAi = authMethod === "openai_oauth";
        const deadline = AbortSignal.timeout(
            Math.max(0, Math.min(Math.ceil(attempt.response.expiresAt - Date.now()), 2147483647)),
        );
        const signal = AbortSignal.any([attempt.abort.signal, deadline]);

        try {
            while (!signal.aborted) {
                await this.wait(interval, signal);

                let result: Awaited<ReturnType<OAuthService["form"]>>;
                try {
                    result = await this.form(
                        isOpenAi ? `${openAiAuthUrl}/api/accounts/deviceauth/token` : tokenUrl,
                        pollBody,
                        signal,
                        isOpenAi,
                    );
                } catch (error) {
                    if (signal.aborted) throw error;
                    interval = Math.max(interval, Math.min(interval * 2, 60000));
                    continue;
                }

                const { response, data } = result;
                if (response.ok) {
                    let tokenData = data;
                    if (isOpenAi) {
                        // OpenAI approves with an authorization code that still has to be exchanged.
                        if (typeof data.authorization_code !== "string" || typeof data.code_verifier !== "string") {
                            throw new OAuthError("OpenAI returned an invalid authorization code", 502);
                        }
                        const exchange = await this.form(
                            tokenUrl,
                            {
                                grant_type: "authorization_code",
                                client_id: clientId,
                                code: data.authorization_code,
                                code_verifier: data.code_verifier,
                                redirect_uri: `${openAiAuthUrl}/deviceauth/callback`,
                            },
                            signal,
                        );
                        if (!exchange.response.ok)
                            throw new OAuthError("OpenAI rejected the authorization. Start again", 502);
                        tokenData = exchange.data;
                    }
                    const credential = this.credential(tokenData, clientId);
                    if (isOpenAi && !getChatGptAccountId(credential.accessToken)) {
                        void this.revokeCredential(credential, authMethod);
                        throw new OAuthError("This OpenAI account has no ChatGPT plan for Codex", 502);
                    }
                    if (signal.aborted || attempt.response.status !== "pending") {
                        void this.revokeCredential(credential, authMethod);
                        break;
                    }

                    const value = {
                        oauthCredential: encrypt(JSON.stringify(credential)),
                        oauthStatus: "authorized" as const,
                    };
                    const id = attempt.input.modelProviderId;

                    if (id !== undefined) {
                        if (!attempt.originalCredential) throw new OAuthError("Original authorization is missing", 409);

                        const updated = db
                            .update(modelProviderTable)
                            .set(value)
                            .where(
                                and(
                                    eq(modelProviderTable.id, id),
                                    eq(modelProviderTable.authMethod, authMethod),
                                    eq(modelProviderTable.oauthCredential, attempt.originalCredential),
                                ),
                            )
                            .returning({ id: modelProviderTable.id })
                            .get();
                        if (!updated) {
                            void this.revokeCredential(credential, authMethod);
                            throw new OAuthError("The provider changed during authorization. Start again", 409);
                        }

                        attempt.response.modelProviderId = id;
                    } else {
                        const saved = db
                            .insert(modelProviderTable)
                            .values({
                                label: attempt.input.label,
                                timeoutSecond: attempt.input.timeoutSecond,
                                requestConcurrency: attempt.input.requestConcurrency ?? null,
                                activityConcurrency: attempt.input.activityConcurrency ?? null,
                                provider: "openai_responses",
                                baseUrl,
                                authMethod,
                                ...value,
                            })
                            .returning({ id: modelProviderTable.id })
                            .get();
                        attempt.response.modelProviderId = saved.id;
                    }

                    this.finish(attempt, "authorized");
                    return;
                }

                const code = errorCode(data);
                if (
                    code === "authorization_pending" ||
                    code === "deviceauth_authorization_pending" ||
                    (isOpenAi && [403, 404].includes(response.status))
                )
                    continue;

                if (code === "slow_down") {
                    interval += 5000;
                    continue;
                }

                if (response.status === 429 || response.status >= 500) {
                    const retryAfter = Number(response.headers.get("retry-after"));
                    interval = Math.max(interval + 5000, Number.isFinite(retryAfter) ? retryAfter * 1000 : 0);
                    continue;
                }

                if (code === "access_denied") {
                    this.finish(attempt, "denied");
                    return;
                }

                if (code === "expired_token") {
                    this.finish(attempt, "expired");
                    return;
                }

                throw new OAuthError(`${name} rejected device authorization. Start again`, 502);
            }
        } catch (error) {
            if (attempt.response.status === "pending" && !deadline.aborted) {
                this.finish(
                    attempt,
                    "failed",
                    error instanceof OAuthError ? error.message : "Authorization could not be saved. Try again",
                );
            }
        } finally {
            if (attempt.response.status === "pending") this.finish(attempt, "expired");
        }
    }

    private provider(id: number) {
        const provider = db.select().from(modelProviderTable).where(eq(modelProviderTable.id, id)).get();
        if (!provider?.oauthCredential || provider.authMethod === "api_key") {
            throw new OAuthError("OAuth provider not found", 404);
        }

        return { ...provider, authMethod: provider.authMethod, oauthCredential: provider.oauthCredential };
    }

    public async getAccessToken(id: number, rejectedAccessToken?: string): Promise<string> {
        const provider = this.provider(id);
        if (provider.oauthStatus === "reauthorization_required")
            throw new OAuthError(`Reconnect this ${providerMap[provider.authMethod].name} provider`, 403);

        const credential = JSON.parse(decrypt(provider.oauthCredential)) as Credential;
        const needsRefresh =
            rejectedAccessToken === credential.accessToken ||
            credential.expiresAt === null ||
            credential.expiresAt <= Date.now() + 60000;
        if (!needsRefresh) return credential.accessToken;

        const active = this.refreshMap.get(id);
        if (active) return (await active).accessToken;

        const promise = this.refresh(id, provider.authMethod, provider.oauthCredential, credential);
        this.refreshMap.set(id, promise);
        try {
            return (await promise).accessToken;
        } finally {
            this.refreshMap.delete(id);
        }
    }

    private async refresh(
        id: number,
        authMethod: OAuthMethod,
        encryptedCredential: string,
        credential: Credential,
    ): Promise<Credential> {
        const { name, tokenUrl } = providerMap[authMethod];
        const { response, data } = await this.form(tokenUrl, {
            client_id: credential.clientId,
            grant_type: "refresh_token",
            refresh_token: credential.refreshToken,
        });

        const condition = and(
            eq(modelProviderTable.id, id),
            eq(modelProviderTable.oauthCredential, encryptedCredential),
        );
        if (!response.ok) {
            // A stale refresh must not invalidate a more recent authorization.
            if (this.provider(id).oauthCredential !== encryptedCredential) {
                return JSON.parse(decrypt(this.provider(id).oauthCredential)) as Credential;
            }

            const code = errorCode(data);
            if (
                [
                    "invalid_grant",
                    "refresh_token_expired",
                    "refresh_token_reused",
                    "refresh_token_invalidated",
                ].includes(String(code))
            ) {
                db.update(modelProviderTable).set({ oauthStatus: "reauthorization_required" }).where(condition).run();
                throw new OAuthError(`${name} authorization expired or was revoked. Reconnect this provider`, 403);
            }

            throw new OAuthError(
                code === "invalid_client"
                    ? `${name} rejected the OAuth client`
                    : `${name} could not refresh the connection. Try again later`,
                502,
            );
        }

        const updated = this.credential(data, credential.clientId, credential);
        const nextCredential = encrypt(JSON.stringify(updated));
        const saved = db
            .update(modelProviderTable)
            .set({
                oauthCredential: nextCredential,
                oauthStatus: "authorized",
            })
            .where(condition)
            .returning({ id: modelProviderTable.id })
            .get();
        if (!saved) {
            try {
                return JSON.parse(decrypt(this.provider(id).oauthCredential)) as Credential;
            } catch (error) {
                void this.revokeCredential(updated, authMethod);
                throw error;
            }
        }

        for (const attempt of this.attemptMap.values()) {
            if (attempt.input.modelProviderId === id && attempt.originalCredential === encryptedCredential) {
                attempt.originalCredential = nextCredential;
            }
        }

        return updated;
    }

    public async revoke(id: number, authMethod: OAuthMethod, encryptedCredential: string) {
        for (const attempt of this.attemptMap.values()) {
            if (attempt.input.modelProviderId === id) this.finish(attempt, "cancelled");
        }

        await this.revokeCredential(JSON.parse(decrypt(encryptedCredential)) as Credential, authMethod);
    }

    private async revokeCredential(credential: Credential, authMethod: OAuthMethod) {
        try {
            await this.form(
                providerMap[authMethod].revokeUrl,
                {
                    client_id: credential.clientId,
                    token: credential.refreshToken,
                    token_type_hint: "refresh_token",
                },
                undefined,
                authMethod === "openai_oauth",
            );
        } catch {
            /* Local removal succeeds even when upstream revocation is unavailable */
        }
    }
}

export const oauthService = new OAuthService();
