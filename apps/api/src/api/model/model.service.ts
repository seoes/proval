import { activityTable, modelProviderTable, repositoryTable } from "@proval/db";
import type {
    ModelProvider,
    ModelProviderResponse,
    ModelProviderCreateInput,
    ModelProviderUpdateInput,
    ModelProviderModelListResponse,
    ReasoningEffort,
} from "@proval/types";
import db from "../../db/index.js";
import { and, count, eq, inArray, isNotNull } from "drizzle-orm";
import OpenAI from "openai";
import { log, logError } from "../../util/log.js";
import { decrypt, encrypt } from "../../util/encrypt.js";
import { createSender } from "../../agent/llm/factory.js";
import type { LlmSender } from "../../agent/llm/loop.js";
import { getXaiModelList } from "../../agent/llm/xai.js";
import { xaiOAuthService } from "./xai-oauth.service.js";
import { z } from "zod";

const providerSchema = z.enum(["openai", "openai_responses", "anthropic"]);
const timeoutSchema = z.number().int().min(10).max(7200);
const concurrencySchema = z.number().int().min(1).nullable().optional();
const labelSchema = z.string().trim().min(1).max(200);
const baseUrlSchema = z.url().refine((value) => ["http:", "https:"].includes(new URL(value).protocol));

interface ModelProviderQuotaUsage {
    fiveHour?: { usage: number; resetAt: Date };
    weekly?: { usage: number; resetAt: Date };
    monthly?: { usage: number; resetAt: Date };
}

export function createModelProviderSender(
    modelProvider: ModelProvider,
    model: string,
    reasoningEffort?: ReasoningEffort,
): LlmSender {
    const config = {
        model,
        timeoutSecond: modelProvider.timeoutSecond,
        modelProviderId: modelProvider.id,
        concurrency: modelProvider.requestConcurrency,
        reasoningEffort,
    };
    if (modelProvider.authMethod === "xai_oauth") {
        return createSender({
            ...config,
            provider: "xai",
            apiKey: "oauth",
            baseURL: modelProvider.baseUrl,
            getAccessToken: (rejected) => xaiOAuthService.getAccessToken(modelProvider.id, rejected),
        });
    }
    if (!modelProvider.apiKey) throw new Error("API key is missing");
    return createSender({
        ...config,
        provider: modelProvider.provider,
        baseURL: modelProvider.baseUrl,
        apiKey: decrypt(modelProvider.apiKey),
    });
}

export class ModelProviderService {
    public async findAll(): Promise<ModelProvider[]> {
        return db.select().from(modelProviderTable);
    }

    public async findById(modelProviderId: number): Promise<ModelProvider> {
        const rows = await db.select().from(modelProviderTable).where(eq(modelProviderTable.id, modelProviderId));
        if (rows.length === 0) {
            throw new Error("Model provider not found");
        }
        return rows[0];
    }

    public async create(data: ModelProviderCreateInput): Promise<ModelProvider> {
        const input = z
            .object({
                provider: providerSchema,
                label: labelSchema,
                baseUrl: baseUrlSchema,
                apiKey: z.string().min(1),
                timeoutSecond: timeoutSchema.optional(),
                requestConcurrency: concurrencySchema,
                activityConcurrency: concurrencySchema,
            })
            .strict()
            .parse(data);
        const result = await db
            .insert(modelProviderTable)
            .values({ ...input, apiKey: encrypt(input.apiKey) })
            .returning();
        return result[0];
    }

    public async update(modelProviderId: number, data: ModelProviderUpdateInput): Promise<ModelProvider> {
        const current = await this.findById(modelProviderId);
        const editable = {
            label: labelSchema.optional(),
            timeoutSecond: timeoutSchema.optional(),
            requestConcurrency: concurrencySchema,
            activityConcurrency: concurrencySchema,
        };
        const cleanData =
            current.authMethod === "xai_oauth"
                ? z.object(editable).strict().parse(data)
                : z
                      .object({ ...editable, provider: providerSchema.optional(), baseUrl: baseUrlSchema.optional() })
                      .strict()
                      .parse(data);
        const result = await db
            .update(modelProviderTable)
            .set(cleanData)
            .where(eq(modelProviderTable.id, modelProviderId))
            .returning();
        if (result.length === 0) {
            throw new Error("Model provider not found");
        }
        return result[0];
    }

    public async updateApiKey(modelProviderId: number, apiKey: string): Promise<void> {
        if ((await this.findById(modelProviderId)).authMethod !== "api_key") {
            throw new Error("Reconnect this provider to update its OAuth credential");
        }
        z.string().min(1).parse(apiKey);
        await db
            .update(modelProviderTable)
            .set({ apiKey: encrypt(apiKey) })
            .where(eq(modelProviderTable.id, modelProviderId));
    }

    public toResponse(modelProvider: ModelProvider): ModelProviderResponse {
        const {
            id,
            provider,
            label,
            baseUrl,
            timeoutSecond,
            requestConcurrency,
            activityConcurrency,
            authMethod,
            oauthStatus,
            createdAt,
            updatedAt,
        } = modelProvider;

        return {
            id,
            provider,
            label,
            baseUrl,
            timeoutSecond,
            requestConcurrency,
            activityConcurrency,
            authMethod,
            oauthStatus,
            createdAt,
            updatedAt,
        };
    }

    public async remove(id: number): Promise<void> {
        const countResult = await db
            .select({ count: count() })
            .from(repositoryTable)
            .where(eq(repositoryTable.modelProviderId, id));
        if (countResult[0].count > 0) {
            throw new Error(
                `There are ${countResult[0].count} repositories using this model provider. Please remove them first.`,
            );
        }
        const [openActivityCount] = await db
            .select({ total: count() })
            .from(activityTable)
            .where(and(eq(activityTable.modelProviderId, id), inArray(activityTable.status, ["queued", "started"])));
        if (openActivityCount.total > 0) {
            throw new Error(
                `There are ${openActivityCount.total} queued or running activities using this model provider. Cancel them first.`,
            );
        }
        const deleted = await db.delete(modelProviderTable).where(eq(modelProviderTable.id, id)).returning();
        if (deleted.length === 0) {
            throw new Error("Model provider not found");
        }
        if (deleted[0].oauthCredential) {
            void xaiOAuthService.revoke(id, deleted[0].oauthCredential).catch(() => {});
        }
    }

    public async listModels(modelProviderId: number): Promise<ModelProviderModelListResponse> {
        const modelProvider = await this.findById(modelProviderId);

        if (modelProvider.authMethod === "xai_oauth") {
            const modelList = await getXaiModelList({
                timeoutSecond: modelProvider.timeoutSecond,
                getAccessToken: (rejected) => xaiOAuthService.getAccessToken(modelProvider.id, rejected),
            });
            return modelList
                ? { models: modelList, source: "openai_compatible" }
                : { models: [], source: "unavailable" };
        }

        if (modelProvider.provider === "anthropic") {
            return { models: [], source: "unavailable" };
        }

        try {
            if (!modelProvider.apiKey) throw new Error("API key is missing");
            const client = new OpenAI({
                apiKey: decrypt(modelProvider.apiKey),
                baseURL: modelProvider.baseUrl,
                timeout: modelProvider.timeoutSecond * 1000,
            });
            const page = await client.models.list();
            const models = page.data.map((m) => ({ id: m.id }));
            return { models, source: "openai_compatible" };
        } catch {
            return { models: [], source: "unavailable" };
        }
    }

    public async verifySaved(modelProviderId: number, modelName: string): Promise<void> {
        const provider = await this.findById(modelProviderId);
        await createModelProviderSender(provider, z.string().trim().min(1).parse(modelName)).send(
            [{ role: "user", content: "Hello" }],
            [],
        );
    }

    public async verifyConfig(
        config: Pick<ModelProviderCreateInput, "provider" | "baseUrl" | "apiKey"> & {
            modelName: string;
            timeoutSecond: number;
        },
    ): Promise<void> {
        const sender = createSender({
            provider: config.provider,
            baseURL: config.baseUrl,
            model: config.modelName,
            apiKey: config.apiKey,
            timeoutSecond: timeoutSchema.parse(config.timeoutSecond),
            maxOutputToken: 1,
        });
        await sender.send([{ role: "user", content: "Hello" }], []);
        log("API key is valid", "Model Provider API Verification");
    }

    public async checkAllAndRemoveRateLimitIfReset(): Promise<ModelProvider[]> {
        const modelProviderList = await this.findAllWithRateLimit();

        const filteredModelProviderList = modelProviderList.filter(
            ({ rateLimitResetAt }) => rateLimitResetAt !== null && rateLimitResetAt <= new Date(),
        );

        if (filteredModelProviderList.length === 0) return [];

        const updatedModelProviderList = await db
            .update(modelProviderTable)
            .set({ rateLimitResetAt: null, rateLimitDescription: null })
            .where(
                inArray(
                    modelProviderTable.id,
                    filteredModelProviderList.map(({ id }) => id),
                ),
            )
            .returning();

        return updatedModelProviderList;
    }

    public async findAllWithRateLimit(): Promise<ModelProvider[]> {
        return db.select().from(modelProviderTable).where(isNotNull(modelProviderTable.rateLimitResetAt));
    }

    public async setRateLimit(modelProviderId: number, resetTime: Date, description: string): Promise<void> {
        await db
            .update(modelProviderTable)
            .set({ rateLimitResetAt: resetTime, rateLimitDescription: description })
            .where(eq(modelProviderTable.id, modelProviderId));
    }

    public async resetRateLimit(modelProviderId: number) {
        await db
            .update(modelProviderTable)
            .set({ rateLimitResetAt: null, rateLimitDescription: null })
            .where(eq(modelProviderTable.id, modelProviderId));
    }

    private async getZaiQuota(apiKey: string): Promise<ModelProviderQuotaUsage> {
        const response = await fetch("https://api.z.ai/api/monitor/usage/quota/limit", {
            headers: { Authorization: apiKey },
            signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok) throw new Error(`z.ai quota request failed with ${response.status}`);
        const body = (await response.json()) as { success?: unknown; data?: unknown };
        if (body.success !== true) throw new Error("z.ai quota response is not success");
        const limits =
            body.data && typeof body.data === "object" && Array.isArray((body.data as { limits?: unknown }).limits)
                ? (body.data as { limits: unknown[] }).limits
                : null;
        if (limits == null) throw new Error("z.ai quota list is missing");

        const usage: ModelProviderQuotaUsage = {};
        for (const row of limits) {
            if (!row || typeof row !== "object") continue;
            const record = row as {
                type?: unknown;
                unit?: unknown;
                number?: unknown;
                percentage?: unknown;
                nextResetTime?: unknown;
            };
            if (record.type !== "TOKENS_LIMIT") continue;
            const percentage = Number(record.percentage);
            if (!Number.isFinite(percentage)) continue;
            const resetAt = typeof record.nextResetTime === "number" ? new Date(record.nextResetTime) : null;
            if (!resetAt || Number.isNaN(resetAt.getTime())) continue;
            const unit = Number(record.unit);
            const windowSize = Number(record.number);
            const window = { usage: percentage, resetAt };
            if (unit === 3 && windowSize === 5) usage.fiveHour = window;
            else if (unit === 6 && windowSize === 1) usage.weekly = window;
        }
        return usage;
    }

    private async getOpenCodeQuota(baseUrl: string, apiKey: string): Promise<ModelProviderQuotaUsage> {
        const response = await fetch(new URL("/inference/go/v1/usage", new URL(baseUrl).origin), {
            headers: { Authorization: `Bearer ${apiKey}` },
            signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok) throw new Error(`OpenCode quota request failed with ${response.status}`);
        const usagePayload = ((await response.json()) as { usage?: Record<string, unknown> }).usage;
        if (!usagePayload) throw new Error("OpenCode usage is missing");

        const readWindow = (window: unknown): { usage: number; resetAt: Date } | null => {
            if (!window || typeof window !== "object") return null;
            const record = window as { status?: unknown; percent?: unknown; resetsAt?: unknown };
            let usage = typeof record.percent === "number" ? record.percent : 0;
            if (record.status === "rate-limited") usage = 100;
            const resetAt = typeof record.resetsAt === "string" ? new Date(record.resetsAt) : null;
            if (!resetAt || Number.isNaN(resetAt.getTime())) return null;
            return { usage, resetAt };
        };

        const fiveHour = readWindow(usagePayload.rolling);
        const weekly = readWindow(usagePayload.weekly);
        const monthly = readWindow(usagePayload.monthly);
        return {
            ...(fiveHour ? { fiveHour } : {}),
            ...(weekly ? { weekly } : {}),
            ...(monthly ? { monthly } : {}),
        };
    }

    public async getQuotaFromUrl(baseUrl: string, apiKey: string): Promise<ModelProviderQuotaUsage | null> {
        try {
            const url = new URL(baseUrl);
            if (url.hostname === "api.z.ai") {
                return await this.getZaiQuota(apiKey);
            }
            const isOpenCodeGo = url.pathname.startsWith("/inference/go") || url.pathname.startsWith("/zen/go");
            if (url.hostname === "opencode.ai" && isOpenCodeGo) {
                return await this.getOpenCodeQuota(baseUrl, apiKey);
            }
            return null;
        } catch (error) {
            logError("Quota probe failed", error);
            return null;
        }
    }
}
