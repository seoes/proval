import { modelProviderTable, repositoryTable } from "@proval/db";
import type {
    ModelProvider,
    ModelProviderResponse,
    ModelProviderCreateInput,
    ModelProviderUpdateInput,
    ModelProviderModelListResponse,
    ReasoningEffort,
} from "@proval/types";
import db from "../../db/index.js";
import { count, eq } from "drizzle-orm";
import OpenAI from "openai";
import { log } from "../../util/log.js";
import { decrypt, encrypt } from "../../util/encrypt.js";
import { createSender } from "../../agent/llm/factory.js";
import type { LlmSender } from "../../agent/llm/loop.js";
import { getXaiModelList } from "../../agent/llm/xai.js";
import { xaiOAuthService } from "./xai-oauth.service.js";
import { z } from "zod";

const providerSchema = z.enum(["openai", "openai_responses", "anthropic"]);
const timeoutSchema = z.number().int().min(10).max(7200);
const labelSchema = z.string().trim().min(1).max(200);
const baseUrlSchema = z.url().refine((value) => ["http:", "https:"].includes(new URL(value).protocol));
export const xaiOAuthAttemptSchema = z
    .object({
        label: labelSchema,
        timeoutSecond: timeoutSchema,
        modelProviderId: z.number().int().positive().optional(),
    })
    .strict();

export function createModelProviderSender(
    modelProvider: ModelProvider,
    model: string,
    reasoningEffort?: ReasoningEffort,
): LlmSender {
    const config = {
        model,
        timeoutSecond: modelProvider.timeoutSecond,
        reasoningEffort,
    };
    if (modelProvider.authMethod === "xai_oauth") {
        return createSender({
            ...config,
            provider: "xai",
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
        const editable = { label: labelSchema.optional(), timeoutSecond: timeoutSchema.optional() };
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
            authMethod,
            oauthStatus,
            createdAt,
            updatedAt
        } = modelProvider;

        return {
            id,
            provider,
            label,
            baseUrl,
            timeoutSecond,
            authMethod,
            oauthStatus,
            createdAt,
            updatedAt
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
        await createModelProviderSender(
            provider,
            z.string().trim().min(1).parse(modelName)
        ).send(
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
            timeoutSecond: config.timeoutSecond,
            maxOutputToken: 1,
        });
        await sender.send([{ role: "user", content: "Hello" }], []);
        log("API key is valid", "Model Provider API Verification");
    }
}
