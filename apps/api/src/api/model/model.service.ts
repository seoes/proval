import { modelTable } from "@code-review/db";
import type { Model, ModelResponse } from "@code-review/types";
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

    public toResponse(model: Model): ModelResponse {
        const { apiKey, ...rest } = model;
        return rest;
    }
}
