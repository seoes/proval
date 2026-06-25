import type { Context, Handler } from "hono";
import { ModelProviderService } from "./model.service.js";
import type {
    ModelProviderResponse,
    ModelProviderInsert,
    ModelProviderUpdateInput,
    SecretInput,
} from "@proval/types";

export const findAllModelProvider: Handler = async (c) => {
    const service = new ModelProviderService();
    const list = await service.findAll();
    const response: ModelProviderResponse[] = list.map((item) => service.toResponse(item));
    return c.json(response, 200);
};

export const findModelProviderById: Handler = async (c) => {
    const service = new ModelProviderService();
    const id = c.req.param("id");
    if (!id) {
        return c.json({ error: "Model provider ID is required" }, 400);
    }
    const modelProvider = await service.findById(parseInt(id));
    return c.json(service.toResponse(modelProvider), 200);
};

export const listModelProviderModels: Handler = async (c) => {
    const service = new ModelProviderService();
    const id = c.req.param("id");
    if (!id) {
        return c.json({ error: "Model provider ID is required" }, 400);
    }
    try {
        const result = await service.listModels(parseInt(id));
        return c.json(result, 200);
    } catch (error) {
        return c.json(
            { error: error instanceof Error ? error.message : "Failed to list models" },
            error instanceof Error && error.message === "Model provider not found" ? 404 : 500,
        );
    }
};

export const createModelProvider: Handler = async (c) => {
    const service = new ModelProviderService();
    const body = await c.req.json<ModelProviderInsert>();
    const modelProvider = await service.create(body);
    return c.json(service.toResponse(modelProvider), 201);
};

export const updateModelProvider: Handler = async (c) => {
    const service = new ModelProviderService();
    const id = c.req.param("id");
    if (!id) {
        return c.json({ error: "Model provider ID is required" }, 400);
    }
    const body = await c.req.json<ModelProviderUpdateInput>();
    const modelProvider = await service.update(parseInt(id), body);
    return c.json(service.toResponse(modelProvider), 200);
};

export const removeModelProvider: Handler = async (c) => {
    const service = new ModelProviderService();
    const id = c.req.param("id");
    if (!id) {
        return c.json({ error: "Model provider ID is required" }, 400);
    }
    try {
        await service.remove(parseInt(id));
        return c.json({ message: "Model provider deleted" }, 200);
    } catch (error) {
        return c.json({ error: error instanceof Error ? error.message : "Failed to delete" }, 400);
    }
};

export const updateModelProviderApiKey: Handler = async (c) => {
    const service = new ModelProviderService();
    const id = c.req.param("id");
    if (!id) {
        return c.json({ error: "Model provider ID is required" }, 400);
    }
    const { value: apiKey } = await c.req.json<SecretInput>();
    if (!apiKey) {
        return c.json({ error: "API key is required" }, 400);
    }
    await service.updateApiKey(parseInt(id), apiKey);
    return c.json({ message: "API key updated" }, 200);
};

export const verifyModelProviderConfig: Handler = async (c: Context) => {
    const service = new ModelProviderService();
    const body = await c.req.json();

    const { provider, baseUrl, modelName, apiKey } = body;
    if (!baseUrl) {
        return c.json({ error: "Base URL is required for verification" }, 400);
    }
    if (!apiKey) {
        return c.json({ error: "API key is required for verification" }, 400);
    }
    if (!modelName) {
        return c.json({ error: "Model name is required for verification" }, 400);
    }
    if (provider !== "anthropic" && provider !== "openai") {
        return c.json({ error: "Invalid provider" }, 400);
    }

    try {
        if (provider === "anthropic") {
            await service.verifyAnthropicApi(baseUrl, modelName, apiKey);
        } else {
            await service.verifyOpenAiApi(baseUrl, modelName, apiKey);
        }
        return c.json({ success: true, message: "Connection successful" }, 200);
    } catch (error) {
        const message = error instanceof Error ? error.message : "Connection failed";
        return c.json({ success: false, message }, 401);
    }
};
