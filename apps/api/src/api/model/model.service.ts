import { modelTable } from "@code-review/db";
import type { Model, ModelResponse, ModelInsert, ModelUpdateInput } from "@code-review/types";
import db from "../../db/index.js";
import { desc, eq } from "drizzle-orm";

export class ModelService {
    public async findAll(): Promise<Model[]> {
        const models = await db.select().from(modelTable).orderBy(desc(modelTable.createdAt));
        return models;
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
        const result = await db
            .update(modelTable)
            .set(cleanData)
            .where(eq(modelTable.id, modelId))
            .returning();
        if (result.length === 0) {
            throw new Error("Model not found");
        }
        return result[0];
    }

    public async updateApiKey(modelId: number, apiKey: string): Promise<void> {
        await db
            .update(modelTable)
            .set({ apiKey })
            .where(eq(modelTable.id, modelId));
    }

    public toResponse(model: Model): ModelResponse {
        const { apiKey, ...rest } = model;
        return rest;
    }

    private removeUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
        return Object.fromEntries(
            Object.entries(obj).filter(([_, v]) => v !== undefined),
        ) as Partial<T>;
    }
}
