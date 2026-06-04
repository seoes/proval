import { modelTable } from "@proval/db";
import type { Model, ModelResponse, ModelInsert, ModelUpdateInput } from "@proval/types";
import db from "../../db/index.js";
import { eq } from "drizzle-orm";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { log } from "../../util/log.js";

export class ModelService {
    public async findAll(): Promise<Model[]> {
        const modelList = await db.select().from(modelTable);
        return modelList;
    }

    public async findById(modelId: number): Promise<Model> {
        const model = await db.select().from(modelTable).where(eq(modelTable.id, modelId));
        if (model.length === 0) {
            throw new Error("Model not found");
        }
        return model[0];
    }

    public async create(data: ModelInsert): Promise<Model> {
        const result = await db.insert(modelTable).values(data).returning();
        return result[0];
    }

    public async update(modelId: number, data: ModelUpdateInput): Promise<Model> {
        const cleanData = this.removeUndefined(data);
        const result = await db.update(modelTable).set(cleanData).where(eq(modelTable.id, modelId)).returning();
        if (result.length === 0) {
            throw new Error("Model not found");
        }
        return result[0];
    }

    public async updateApiKey(modelId: number, apiKey: string): Promise<void> {
        await db.update(modelTable).set({ apiKey }).where(eq(modelTable.id, modelId));
    }

    public toResponse(model: Model): ModelResponse {
        const { apiKey: _apiKey, ...rest } = model;
        return rest;
    }

    public async remove(id: number): Promise<void> {
        await db.delete(modelTable).where(eq(modelTable.id, id));
    }

    private removeUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
        return Object.fromEntries(Object.entries(obj).filter(([_, v]) => v !== undefined)) as Partial<T>;
    }
    public async verifyOpenAiApi(baseUrl: string, model: string, apiKey: string): Promise<void> {
        const client = new OpenAI({ apiKey, baseURL: baseUrl });
        await client.chat.completions.create({
            model,
            messages: [{ role: "user", content: "Hello" }],
            max_tokens: 1,
        });
        log("API key is valid", "Model API Verification");
    }

    public async verifyAnthropicApi(baseUrl: string, model: string, apiKey: string): Promise<void> {
        const client = new Anthropic({ apiKey, baseURL: baseUrl });
        await client.messages.create({
            model,
            max_tokens: 1,
            messages: [{ role: "user", content: "Hello" }],
        });
        log("API key is valid", "Model API Verification");
    }
}
