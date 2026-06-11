import { modelProviderTable, repositoryTable } from "@proval/db";
import type {
    ModelProvider,
    ModelProviderResponse,
    ModelProviderInsert,
    ModelProviderUpdateInput,
    ModelProviderModelListResponse,
} from "@proval/types";
import db from "../../db/index.js";
import { count, eq } from "drizzle-orm";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { log } from "../../util/log.js";

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

    public async create(data: ModelProviderInsert): Promise<ModelProvider> {
        const result = await db.insert(modelProviderTable).values(data).returning();
        return result[0];
    }

    public async update(modelProviderId: number, data: ModelProviderUpdateInput): Promise<ModelProvider> {
        const cleanData = this.removeUndefined(data);
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
        await db.update(modelProviderTable).set({ apiKey }).where(eq(modelProviderTable.id, modelProviderId));
    }

    public toResponse(modelProvider: ModelProvider): ModelProviderResponse {
        const { apiKey: _apiKey, ...rest } = modelProvider;
        return rest;
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
        const deleted = await db
            .delete(modelProviderTable)
            .where(eq(modelProviderTable.id, id))
            .returning({ id: modelProviderTable.id });
        if (deleted.length === 0) {
            throw new Error("Model provider not found");
        }
    }

    public async listModels(modelProviderId: number): Promise<ModelProviderModelListResponse> {
        const modelProvider = await this.findById(modelProviderId);

        if (modelProvider.provider === "anthropic") {
            return { models: [], source: "unavailable" };
        }

        try {
            const client = new OpenAI({ apiKey: modelProvider.apiKey, baseURL: modelProvider.baseUrl });
            const page = await client.models.list();
            const models = page.data.map((m) => ({ id: m.id }));
            return { models, source: "openai_compatible" };
        } catch {
            return { models: [], source: "unavailable" };
        }
    }

    private removeUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
        return Object.fromEntries(Object.entries(obj).filter(([_, v]) => v !== undefined)) as Partial<T>;
    }

    public async verifyOpenAiApi(baseUrl: string, modelName: string, apiKey: string): Promise<void> {
        const client = new OpenAI({ apiKey, baseURL: baseUrl });
        await client.chat.completions.create({
            model: modelName,
            messages: [{ role: "user", content: "Hello" }],
            max_tokens: 1,
        });
        log("API key is valid", "Model Provider API Verification");
    }

    public async verifyAnthropicApi(baseUrl: string, modelName: string, apiKey: string): Promise<void> {
        const client = new Anthropic({ apiKey, baseURL: baseUrl });
        await client.messages.create({
            model: modelName,
            max_tokens: 1,
            messages: [{ role: "user", content: "Hello" }],
        });
        log("API key is valid", "Model Provider API Verification");
    }
}
