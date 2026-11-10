import { gitProviderAccessTable, repositoryTable } from "@proval/db";
import type { Access, AccessInsert, AccessProvider, AccessResponse, AccessUpdateInput } from "@proval/types";
import db from "../../db";
import { count, eq, getTableColumns } from "drizzle-orm";
import { decrypt, encrypt } from "../../util/encrypt.js";
import {
    normalizeWebhookSecret,
    normalizeWebhookSigningToken,
    WebhookCredentialError,
} from "../../util/webhook-secret.js";

function isAccessAutoCreateDefaultConfigValueMissing(value: unknown): boolean {
    if (value === null || value === undefined) {
        return true;
    }
    return typeof value === "string" && !value.trim();
}

function normalizeAccessBaseUrl(url: string): string {
    const trimmed = url.trim();
    if (!trimmed) {
        return "";
    }
    try {
        const parsed = new URL(trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed);
        return `${parsed.protocol}//${parsed.host}`.toLowerCase();
    } catch {
        return trimmed.replace(/\/$/, "").toLowerCase();
    }
}

export class GitLabAccessService {
    public hasAutoCreateDefaultConfig(access: Access): boolean {
        const hasCredential =
            access.defaultWebhookSecret?.trim() ||
            (access.provider === "gitlab" && access.defaultWebhookSigningToken?.trim());
        if (!access.autoCreateEnabled || !hasCredential) {
            return false;
        }
        for (const key of Object.keys(getTableColumns(gitProviderAccessTable))) {
            if (!key.startsWith("default") || key === "defaultWebhookSecret" || key === "defaultWebhookSigningToken") {
                continue;
            }
            if (isAccessAutoCreateDefaultConfigValueMissing(access[key as keyof Access])) {
                return false;
            }
        }
        return true;
    }

    public toResponse(access: Access): AccessResponse {
        const { accessToken: _accessToken, defaultWebhookSecret, defaultWebhookSigningToken, ...rest } = access;
        return {
            ...rest,
            hasDefaultWebhookSecret: Boolean(defaultWebhookSecret?.trim()),
            hasDefaultWebhookSigningToken: Boolean(defaultWebhookSigningToken?.trim()),
        };
    }

    public async findAll(): Promise<AccessResponse[]> {
        const accessList = await db.select().from(gitProviderAccessTable);
        return accessList.map((access) => this.toResponse(access));
    }

    public async findById(id: number): Promise<AccessResponse> {
        const access = await this.findByIdRaw(id);
        return this.toResponse(access);
    }

    public async findByIdRaw(id: number): Promise<Access> {
        const accessList = await db.select().from(gitProviderAccessTable).where(eq(gitProviderAccessTable.id, id));
        if (accessList.length === 0) {
            throw new Error("Access configuration not found");
        }
        return accessList[0];
    }

    public async findByProvider(provider: AccessProvider): Promise<AccessResponse[]> {
        const accessList = await db
            .select()
            .from(gitProviderAccessTable)
            .where(eq(gitProviderAccessTable.provider, provider));
        return accessList.map((access) => this.toResponse(access));
    }

    public async findForAutoCreate(provider: AccessProvider, instanceBaseUrl: string): Promise<Access | null> {
        const normalized = normalizeAccessBaseUrl(instanceBaseUrl);
        if (!normalized) {
            return null;
        }
        const accessList = await db
            .select()
            .from(gitProviderAccessTable)
            .where(eq(gitProviderAccessTable.provider, provider));
        for (const access of accessList) {
            if (!this.hasAutoCreateDefaultConfig(access)) {
                continue;
            }
            if (normalizeAccessBaseUrl(access.baseUrl) === normalized) {
                return access;
            }
        }
        return null;
    }

    public async getAccessToken(id: number) {
        const [access] = await db
            .select({ accessToken: gitProviderAccessTable.accessToken })
            .from(gitProviderAccessTable)
            .where(eq(gitProviderAccessTable.id, id));
        if (!access) {
            throw new Error("Access configuration not found");
        }
        if (!access.accessToken) {
            throw new Error("Access token not found");
        }

        return decrypt(access.accessToken);
    }

    public async create(
        provider: AccessInsert["provider"],
        name: string,
        baseUrl: string,
        accessToken: string,
    ): Promise<AccessResponse> {
        const newAccess = await db
            .insert(gitProviderAccessTable)
            .values({
                provider,
                name,
                baseUrl,
                accessToken: encrypt(accessToken),
            })
            .returning();
        return this.toResponse(newAccess[0]);
    }

    public async updateById(id: number, input: AccessUpdateInput & { accessToken?: string }): Promise<AccessResponse> {
        const existing = await this.findByIdRaw(id);
        const name = input.name?.trim();
        const baseUrl = input.baseUrl?.trim();
        if (!name) {
            throw new Error("Name is required");
        }
        if (!baseUrl) {
            throw new Error("Base URL is required");
        }
        if (typeof input.autoCreateEnabled !== "boolean") {
            throw new Error("autoCreateEnabled is required");
        }
        const signingTokenInput = normalizeWebhookSigningToken(input.defaultWebhookSigningToken);
        if (existing.provider !== "gitlab" && signingTokenInput) {
            throw new WebhookCredentialError("Signing token is only configurable for GitLab connections");
        }

        const patch: Record<string, unknown> = {
            name,
            baseUrl,
        };
        if (input.accessToken !== undefined && input.accessToken.trim() !== "") {
            patch.accessToken = encrypt(input.accessToken.trim());
        }

        if (!input.autoCreateEnabled) {
            const clearedDefaultConfigPatch = Object.fromEntries(
                Object.keys(getTableColumns(gitProviderAccessTable))
                    .filter((key) => key.startsWith("default"))
                    .map((key) => [key, null]),
            );
            Object.assign(patch, { autoCreateEnabled: false, ...clearedDefaultConfigPatch });
        } else {
            const secretInput = normalizeWebhookSecret(input.defaultWebhookSecret);
            const existingSecret = existing.defaultWebhookSecret ? decrypt(existing.defaultWebhookSecret).trim() : "";
            const webhookSecret = secretInput || existingSecret;
            const existingSigningToken = existing.defaultWebhookSigningToken
                ? decrypt(existing.defaultWebhookSigningToken).trim()
                : "";
            const signingToken = existing.provider === "gitlab" ? signingTokenInput || existingSigningToken : "";
            if (!webhookSecret && !signingToken) {
                throw new WebhookCredentialError(
                    existing.provider === "gitlab"
                        ? "Default webhook secret or signing token is required when auto create is enabled"
                        : "Default webhook secret is required when auto create is enabled",
                );
            }
            const defaultConfigPolicyPatch: Record<string, unknown> = {};
            for (const key of Object.keys(getTableColumns(gitProviderAccessTable))) {
                if (
                    !key.startsWith("default") ||
                    key === "defaultWebhookSecret" ||
                    key === "defaultWebhookSigningToken"
                ) {
                    continue;
                }
                const value = input[key as keyof typeof input];
                if (isAccessAutoCreateDefaultConfigValueMissing(value)) {
                    throw new Error(`${key} is required when auto create is enabled`);
                }
                if (typeof value === "string") {
                    defaultConfigPolicyPatch[key] = value.trim();
                } else {
                    defaultConfigPolicyPatch[key] = value;
                }
            }
            Object.assign(patch, {
                autoCreateEnabled: true,
                defaultWebhookSecret: secretInput ? encrypt(secretInput) : existing.defaultWebhookSecret,
                defaultWebhookSigningToken: signingTokenInput
                    ? encrypt(signingTokenInput)
                    : existing.defaultWebhookSigningToken,
                ...defaultConfigPolicyPatch,
            });
        }

        const updatedAccess = await db
            .update(gitProviderAccessTable)
            .set(patch)
            .where(eq(gitProviderAccessTable.id, id))
            .returning();
        if (updatedAccess.length === 0) {
            throw new Error("Access configuration not found");
        }
        return this.toResponse(updatedAccess[0]);
    }

    public async deleteById(id: number) {
        const countResult = await db
            .select({ count: count() })
            .from(repositoryTable)
            .where(eq(repositoryTable.gitProviderAccessId, id));
        if (countResult[0].count > 0) {
            throw new Error(
                `There are ${countResult[0].count} repositories using this access configuration. Please remove them first.`,
            );
        }
        const deletedAccess = await db
            .delete(gitProviderAccessTable)
            .where(eq(gitProviderAccessTable.id, id))
            .returning({ id: gitProviderAccessTable.id });
        if (deletedAccess.length === 0) {
            throw new Error("Access configuration not found");
        }
        return deletedAccess[0].id;
    }

    public async updateAccessTokenById(id: number, accessToken: string) {
        const updatedAccess = await db
            .update(gitProviderAccessTable)
            .set({ accessToken: encrypt(accessToken) })
            .where(eq(gitProviderAccessTable.id, id))
            .returning({ id: gitProviderAccessTable.id });
        if (updatedAccess.length === 0) {
            throw new Error("Access configuration not found");
        }
        return updatedAccess[0].id;
    }

    public async getConnectedGitProviderRepositoryIds(accessId: number): Promise<Set<number>> {
        const rows = await db
            .select({ gitProviderRepositoryId: repositoryTable.gitProviderRepositoryId })
            .from(repositoryTable)
            .where(eq(repositoryTable.gitProviderAccessId, accessId));

        return new Set(rows.map((row) => row.gitProviderRepositoryId).filter((id): id is number => id != null));
    }

    public async testGitLab(baseUrl: string, accessToken: string) {
        const url = new URL("/api/v4/user", baseUrl);
        if (url.protocol !== "https:" && url.protocol !== "http:") {
            throw new Error("Invalid base URL");
        }
        const response = await fetch(url.toString(), {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
            },
            keepalive: false,
        });
        if (response.ok) {
            return { success: true, message: "Authorized" };
        }
        const raw = (await response.text()).trim();
        const base = `${response.status} ${response.statusText}`.trim();
        let message = base;
        if (raw) {
            try {
                const body = JSON.parse(raw) as { message?: string };
                if (typeof body.message === "string" && body.message.trim()) {
                    message = `${base} (${body.message.trim()})`;
                }
            } catch {
                // ignore
            }
        }
        return { success: false, message };
    }

    public async testForgejo(baseUrl: string, accessToken: string) {
        const url = new URL("/api/v1/user", baseUrl);
        if (url.protocol !== "https:" && url.protocol !== "http:") {
            throw new Error("Invalid base URL");
        }
        const response = await fetch(url.toString(), {
            headers: {
                Authorization: `token ${accessToken}`,
            },
        });
        if (response.ok) {
            return { success: true, message: "Authorized" };
        }
        const raw = (await response.text()).trim();
        const base = `${response.status} ${response.statusText}`.trim();
        let message = base;
        if (raw) {
            try {
                const body = JSON.parse(raw) as { message?: string };
                if (typeof body.message === "string" && body.message.trim()) {
                    message = `${base} (${body.message.trim()})`;
                }
            } catch {
                // ignore
            }
        }
        return { success: false, message };
    }

    public async testGitea(baseUrl: string, accessToken: string, timeoutMs = 10000) {
        let url: URL;
        try {
            const normalized = baseUrl.trim().replace(/\/+$/, "");
            url = new URL(`${normalized}/api/v1/user`);
        } catch {
            return { success: false, message: "Invalid base URL. HTTP or HTTPS protocol required." };
        }

        if (url.protocol !== "https:" && url.protocol !== "http:") {
            return { success: false, message: "Invalid base URL. HTTP or HTTPS protocol required." };
        }

        const trimmedToken = accessToken.trim();
        if (!trimmedToken) {
            return { success: false, message: "Access token is required." };
        }

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(new Error("Connection timed out")), timeoutMs);

        try {
            const response = await fetch(url.toString(), {
                method: "GET",
                headers: {
                    Authorization: `token ${trimmedToken}`,
                    Accept: "application/json",
                },
                signal: controller.signal,
            });

            if (response.ok) {
                const data = (await response.json()) as {
                    login?: string;
                    username?: string;
                    full_name?: string;
                    active?: boolean;
                    prohibit_login?: boolean;
                };

                if (data.prohibit_login || data.active === false) {
                    return { success: false, message: "User account is inactive or prohibited from logging in." };
                }

                const username = data.login || data.username || "authenticated user";
                const now = new Date();
                const testedAt = now.toISOString();
                const timeString = `${String(now.getHours()).padStart(2, "0")}h ${String(now.getMinutes()).padStart(2, "0")}m ${String(now.getSeconds()).padStart(2, "0")}s`;

                return {
                    success: true,
                    message: `Connected as ${username} (${timeString})`,
                    username,
                    testedAt,
                };
            }

            if (response.status === 401 || response.status === 403) {
                let detail = "";
                try {
                    const body = (await response.json()) as { message?: string };
                    if (body && typeof body.message === "string" && body.message.trim()) {
                        detail = ` (${body.message.trim()})`;
                    }
                } catch {
                    // ignore json parse error
                }
                return { success: false, message: `Invalid or unauthorized access token${detail}` };
            }

            if (response.status === 404) {
                return { success: false, message: "Gitea API endpoint was not found (404). Check the base URL." };
            }

            if (response.status >= 500) {
                return { success: false, message: `Gitea server error (${response.status} ${response.statusText})` };
            }

            return {
                success: false,
                message: `Unexpected response from Gitea (${response.status} ${response.statusText})`,
            };
        } catch (error) {
            if (isSslError(error)) {
                return {
                    success: false,
                    message: "SSL certificate validation failed. Check your SSL certificates and CA configuration.",
                };
            }
            if (isTimeoutError(error)) {
                return {
                    success: false,
                    message: "Connection timed out after 10 seconds. Check if the instance is reachable.",
                };
            }
            if (isNetworkError(error)) {
                return {
                    success: false,
                    message: "Gitea instance is unreachable. Check the host and network connection.",
                };
            }
            const msg = error instanceof Error ? error.message : "Unexpected error";
            return { success: false, message: `Connection failed (${msg})` };
        } finally {
            clearTimeout(timer);
        }
    }
}

function isSslError(err: unknown): boolean {
    if (!err || typeof err !== "object") {
        return false;
    }
    const error = err as { code?: string; message?: string; cause?: { code?: string; message?: string } };
    const code = error.code || error.cause?.code || "";
    const msg = `${error.message || ""} ${error.cause?.message || ""}`.toLowerCase();
    if (
        code.startsWith("CERT_") ||
        code.startsWith("ERR_TLS_") ||
        code === "DEPTH_ZERO_SELF_SIGNED_CERT" ||
        code === "SELF_SIGNED_CERT_IN_CHAIN" ||
        code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE"
    ) {
        return true;
    }
    return msg.includes("certificate") || msg.includes("self signed") || msg.includes("ssl") || msg.includes("tls");
}

function isTimeoutError(err: unknown): boolean {
    if (!err || typeof err !== "object") {
        return false;
    }
    const error = err as { name?: string; message?: string };
    const name = error.name || "";
    const msg = (error.message || "").toLowerCase();
    return name === "AbortError" || name === "TimeoutError" || msg.includes("timed out") || msg.includes("timeout");
}

function isNetworkError(err: unknown): boolean {
    if (!err || typeof err !== "object") {
        return false;
    }
    const error = err as { code?: string; message?: string; cause?: { code?: string; message?: string } };
    const code = error.code || error.cause?.code || "";
    const msg = `${error.message || ""} ${error.cause?.message || ""}`.toLowerCase();
    if (
        code === "ECONNREFUSED" ||
        code === "ConnectionRefused" ||
        code === "ENOTFOUND" ||
        code === "EHOSTUNREACH" ||
        code === "ECONNRESET" ||
        code === "EAI_AGAIN"
    ) {
        return true;
    }
    return (
        msg.includes("econnrefused") ||
        msg.includes("enotfound") ||
        msg.includes("failed to fetch") ||
        msg.includes("fetch failed") ||
        msg.includes("unable to connect")
    );
}
