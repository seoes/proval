import { modelProviderTable } from "@proval/db";
import type { XaiOAuthAttemptInput, XaiOAuthAttemptResponse } from "@proval/types";
import { and, eq } from "drizzle-orm";
import { setTimeout as delay } from "node:timers/promises";
import db from "../../db/index.js";
import { decrypt, encrypt } from "../../util/encrypt.js";
import type { SenderSDKConfig } from "../../agent/llm/factory.js";
import { xaiBaseUrl } from "../../agent/llm/xai.js";

const clientId = "b1a00492-073a-47ea-816f-4c329264a828";
const authUrl = "https://auth.x.ai/oauth2";

type Credential = {
    clientId: string;
    accessToken: string;
    refreshToken: string;
    expiresAt: number | null;
};

type Attempt = {
    owner: string;
    input: XaiOAuthAttemptInput;
    response: XaiOAuthAttemptResponse;
    abort: AbortController;
    originalCredential: string | null;
};

export class XaiOAuthError extends Error {
    constructor(
        message: string,
        public readonly status: 400 | 403 | 404 | 409 | 429 | 502 = 400,
    ) {
        super(message);
    }
}

export class XaiOAuthService {
    private readonly attemptMap = new Map<string, Attempt>();
    private readonly startingOwnerSet = new Set<string>();
    private readonly refreshMap = new Map<number, Promise<Credential>>();

    constructor(
        private readonly request: SenderSDKConfig["fetch"] = (input, init) => fetch(input, init),
        private readonly wait = (ms: number, signal: AbortSignal) => delay(ms, undefined, { signal }),
    ) {}

    private async form(path: string, body: Record<string, string>, signal?: AbortSignal) {
        const response = await this.request(`${authUrl}/${path}`, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "Proval" },
            body: new URLSearchParams(body).toString(),
            redirect: "error",
            signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000),
        });

        const data = await response.json().catch(() => null);
        if (!data || typeof data !== "object" || Array.isArray(data)) {
            throw new XaiOAuthError("xAI returned an invalid authorization response", 502);
        }

        return { response, data: data as Record<string, unknown> };
    }

    private credential(data: Record<string, unknown>, previous?: Credential): Credential {
        const accessToken = data.access_token;
        const refreshToken = data.refresh_token ?? previous?.refreshToken;
        if (
            typeof accessToken !== "string" ||
            !accessToken ||
            typeof refreshToken !== "string" ||
            !refreshToken ||
            (data.token_type !== undefined && String(data.token_type).toLowerCase() !== "bearer")
        ) {
            throw new XaiOAuthError("xAI did not return a usable renewable credential", 502);
        }

        let expiresAt: number | null = null;
        if (typeof data.expires_in === "number" && Number.isFinite(data.expires_in) && data.expires_in > 0) {
            expiresAt = Date.now() + data.expires_in * 1000;
        } else {
            // An unverified JWT expiry is only a refresh scheduling hint.
            try {
                const payload = JSON.parse(Buffer.from(accessToken.split(".")[1], "base64url").toString());
                if (typeof payload.exp === "number" && Number.isFinite(payload.exp)) expiresAt = payload.exp * 1000;
            } catch {
                /* Opaque access tokens are supported */
            }
        }

        return { clientId: previous?.clientId ?? clientId, accessToken, refreshToken, expiresAt };
    }

    async start(owner: string, input: XaiOAuthAttemptInput): Promise<XaiOAuthAttemptResponse> {
        if (this.startingOwnerSet.has(owner)) throw new XaiOAuthError("Authorization is already starting", 409);
        if (this.attemptMap.size + this.startingOwnerSet.size >= 256) {
            throw new XaiOAuthError("Too many authorization attempts. Try again later", 429);
        }

        let originalCredential: string | null = null;
        if (input.modelProviderId !== undefined) {
            const provider = this.provider(input.modelProviderId);
            originalCredential = provider.oauthCredential;
        }

        for (const attempt of this.attemptMap.values()) {
            if (attempt.owner === owner && attempt.response.status === "pending") this.finish(attempt, "cancelled");
        }

        this.startingOwnerSet.add(owner);
        try {
            const { response, data } = await this.form("device/code", {
                client_id: clientId,
                scope: "openid profile email offline_access grok-cli:access api:access",
                referrer: "proval",
            });
            if (!response.ok) throw new XaiOAuthError("xAI could not start device authorization", 502);

            if (
                typeof data.device_code !== "string" ||
                !data.device_code ||
                typeof data.user_code !== "string" ||
                typeof data.expires_in !== "number" ||
                !Number.isFinite(data.expires_in) ||
                data.expires_in <= 0
            ) {
                throw new XaiOAuthError("xAI returned an invalid device code", 502);
            }

            const verificationUri = new URL(String(data.verification_uri_complete ?? data.verification_uri));
            if (
                verificationUri.protocol !== "https:" ||
                !["accounts.x.ai", "auth.x.ai"].includes(verificationUri.hostname) ||
                verificationUri.username ||
                verificationUri.password ||
                verificationUri.port
            ) {
                throw new XaiOAuthError("xAI returned an unexpected verification address", 502);
            }

            const attempt: Attempt = {
                owner,
                input,
                originalCredential,
                abort: new AbortController(),
                response: {
                    id: crypto.randomUUID(),
                    status: "pending",
                    userCode: data.user_code,
                    label: input.label,
                    timeoutSecond: input.timeoutSecond,
                    verificationUri: verificationUri.href,
                    expiresAt: Date.now() + data.expires_in * 1000,
                },
            };
            this.attemptMap.set(attempt.response.id, attempt);

            const interval =
                typeof data.interval === "number" && Number.isFinite(data.interval) && data.interval > 0
                    ? data.interval * 1000
                    : 5000;
            void this.poll(attempt, data.device_code, interval);

            return { ...attempt.response };
        } finally {
            this.startingOwnerSet.delete(owner);
        }
    }

    get(owner: string, id: string): XaiOAuthAttemptResponse {
        const attempt = this.findAttempt(owner, id);
        if (attempt.response.status === "pending" && Date.now() >= attempt.response.expiresAt)
            this.finish(attempt, "expired");

        return { ...attempt.response };
    }

    cancel(owner: string, id: string): XaiOAuthAttemptResponse {
        const attempt = this.findAttempt(owner, id);
        if (attempt.response.status === "pending") this.finish(attempt, "cancelled");

        return { ...attempt.response };
    }

    private findAttempt(owner: string, id: string): Attempt {
        const attempt = this.attemptMap.get(id);
        if (attempt?.owner !== owner) throw new XaiOAuthError("Authorization attempt not found. Start again", 404);

        return attempt;
    }

    private finish(attempt: Attempt, status: XaiOAuthAttemptResponse["status"], error?: string) {
        if (attempt.response.status !== "pending") return;

        attempt.response.status = status;
        attempt.response.error = error;
        attempt.abort.abort();
        setTimeout(() => this.attemptMap.delete(attempt.response.id), 600000).unref();
    }

    private async poll(attempt: Attempt, deviceCode: string, interval: number) {
        const deadline = AbortSignal.timeout(
            Math.max(0, Math.min(Math.ceil(attempt.response.expiresAt - Date.now()), 2147483647)),
        );
        const signal = AbortSignal.any([attempt.abort.signal, deadline]);

        try {
            while (!signal.aborted) {
                await this.wait(interval, signal);

                let result: Awaited<ReturnType<XaiOAuthService["form"]>>;
                try {
                    result = await this.form(
                        "token",
                        {
                            client_id: clientId,
                            device_code: deviceCode,
                            grant_type: "urn:ietf:params:oauth:grant-type:device_code",
                        },
                        signal,
                    );
                } catch (error) {
                    if (signal.aborted) throw error;
                    interval = Math.max(interval, Math.min(interval * 2, 60000));
                    continue;
                }

                const { response, data } = result;
                if (response.ok) {
                    const credential = this.credential(data);
                    if (signal.aborted || attempt.response.status !== "pending") {
                        void this.revokeCredential(credential);
                        break;
                    }

                    const value = {
                        oauthCredential: encrypt(JSON.stringify(credential)),
                        oauthStatus: "authorized" as const,
                    };
                    const id = attempt.input.modelProviderId;

                    // Synchronous writes make completion and cancellation mutually exclusive.
                    if (id !== undefined) {
                        if (!attempt.originalCredential)
                            throw new XaiOAuthError("Original authorization is missing", 409);

                        const updated = db
                            .update(modelProviderTable)
                            .set(value)
                            .where(
                                and(
                                    eq(modelProviderTable.id, id),
                                    eq(modelProviderTable.authMethod, "xai_oauth"),
                                    eq(modelProviderTable.oauthCredential, attempt.originalCredential),
                                ),
                            )
                            .returning({ id: modelProviderTable.id })
                            .get();
                        if (!updated) {
                            void this.revokeCredential(credential);
                            throw new XaiOAuthError("The provider changed during authorization. Start again", 409);
                        }

                        attempt.response.modelProviderId = id;
                    } else {
                        const saved = db
                            .insert(modelProviderTable)
                            .values({
                                label: attempt.input.label,
                                timeoutSecond: attempt.input.timeoutSecond,
                                provider: "openai_responses",
                                baseUrl: xaiBaseUrl,
                                authMethod: "xai_oauth",
                                ...value,
                            })
                            .returning({ id: modelProviderTable.id })
                            .get();
                        attempt.response.modelProviderId = saved.id;
                    }

                    this.finish(attempt, "authorized");
                    return;
                }

                if (data.error === "authorization_pending") continue;

                if (data.error === "slow_down") {
                    interval += 5000;
                    continue;
                }

                if (response.status === 429 || response.status >= 500) {
                    const retryAfter = Number(response.headers.get("retry-after"));
                    interval = Math.max(interval + 5000, Number.isFinite(retryAfter) ? retryAfter * 1000 : 0);
                    continue;
                }

                if (data.error === "access_denied") {
                    this.finish(attempt, "denied");
                    return;
                }

                if (data.error === "expired_token") {
                    this.finish(attempt, "expired");
                    return;
                }

                throw new XaiOAuthError("xAI rejected device authorization. Start again", 502);
            }
        } catch (error) {
            if (attempt.response.status === "pending" && !deadline.aborted) {
                this.finish(
                    attempt,
                    "failed",
                    error instanceof XaiOAuthError ? error.message : "Authorization could not be saved. Try again",
                );
            }
        } finally {
            if (attempt.response.status === "pending") this.finish(attempt, "expired");
        }
    }

    private provider(id: number) {
        const provider = db.select().from(modelProviderTable).where(eq(modelProviderTable.id, id)).get();
        if (!provider?.oauthCredential || provider.authMethod !== "xai_oauth") {
            throw new XaiOAuthError("xAI OAuth provider not found", 404);
        }

        return { ...provider, oauthCredential: provider.oauthCredential };
    }

    async getAccessToken(id: number, rejectedAccessToken?: string): Promise<string> {
        const provider = this.provider(id);
        if (provider.oauthStatus === "reauthorization_required")
            throw new XaiOAuthError("Reconnect this xAI provider", 403);

        const credential = JSON.parse(decrypt(provider.oauthCredential)) as Credential;
        const needsRefresh =
            rejectedAccessToken === credential.accessToken ||
            (credential.expiresAt !== null && credential.expiresAt <= Date.now() + 120000);
        if (!needsRefresh) return credential.accessToken;

        const active = this.refreshMap.get(id);
        if (active) return (await active).accessToken;

        const promise = this.refresh(id, provider.oauthCredential, credential);
        this.refreshMap.set(id, promise);
        try {
            return (await promise).accessToken;
        } finally {
            this.refreshMap.delete(id);
        }
    }

    private async refresh(id: number, encryptedCredential: string, credential: Credential): Promise<Credential> {
        const { response, data } = await this.form("token", {
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

            if (data.error === "invalid_grant") {
                db.update(modelProviderTable).set({ oauthStatus: "reauthorization_required" }).where(condition).run();
                throw new XaiOAuthError("xAI authorization expired or was revoked. Reconnect this provider", 403);
            }

            throw new XaiOAuthError(
                data.error === "invalid_client"
                    ? "xAI rejected the OAuth client"
                    : "xAI could not refresh the connection. Try again later",
                502,
            );
        }

        const updated = this.credential(data, credential);
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
            // Return the new authorization without recursively joining this refresh promise.
            try {
                return JSON.parse(decrypt(this.provider(id).oauthCredential)) as Credential;
            } catch (error) {
                void this.revokeCredential(updated);
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

    async revoke(id: number, encryptedCredential: string) {
        for (const attempt of this.attemptMap.values()) {
            if (attempt.input.modelProviderId === id) this.finish(attempt, "cancelled");
        }

        await this.revokeCredential(JSON.parse(decrypt(encryptedCredential)) as Credential);
    }

    private async revokeCredential(credential: Credential) {
        try {
            await this.form("revoke", {
                client_id: credential.clientId,
                token: credential.refreshToken,
                token_type_hint: "refresh_token",
            });
        } catch {
            /* Local removal succeeds even when upstream revocation is unavailable */
        }
    }
}

export const xaiOAuthService = new XaiOAuthService();
