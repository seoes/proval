import type { Context, Handler } from "hono";
import { ModelService } from "./model.service.js";
import type { ModelResponse, ModelInsert, ModelUpdateInput, SecretInput } from "@code-review/types";

export const findAllModel: Handler = async (c) => {
    console.log("findAllModel");
    const modelService = new ModelService();
    const modelList = await modelService.findAll();
    const modelResponseList: ModelResponse[] = modelList.map((model) => modelService.toResponse(model));
    console.log(modelResponseList);
    return c.json(modelResponseList, 200);
};

export const findById: Handler = async (c) => {
    const modelService = new ModelService();
    const modelId = c.req.param("id");
    if (!modelId) {
        return c.json({ error: "Model ID is required" }, 400);
    }
    const model = await modelService.findById(parseInt(modelId));
    const modelResponse = modelService.toResponse(model);
    return c.json(modelResponse, 200);
};

export const createModel: Handler = async (c) => {
    const modelService = new ModelService();
    const body = await c.req.json<ModelInsert>();
    const model = await modelService.create(body);
    const modelResponse = modelService.toResponse(model);
    return c.json(modelResponse, 201);
};

export const updateModel: Handler = async (c) => {
    const modelService = new ModelService();
    const modelId = c.req.param("id");
    if (!modelId) {
        return c.json({ error: "Model ID is required" }, 400);
    }
    const body = await c.req.json<ModelUpdateInput>();
    const model = await modelService.update(parseInt(modelId), body);
    const modelResponse = modelService.toResponse(model);
    return c.json(modelResponse, 200);
};

export const removeModel: Handler = async (c) => {
    const modelService = new ModelService();
    const modelId = c.req.param("id");
    if (!modelId) {
        return c.json({ error: "Model ID is required" }, 400);
    }
    await modelService.remove(parseInt(modelId));
    return c.json({ message: "Model deleted" }, 200);
};

export const updateApiKey: Handler = async (c) => {
    const modelService = new ModelService();
    const modelId = c.req.param("id");
    if (!modelId) {
        return c.json({ error: "Model ID is required" }, 400);
    }
    const { value: apiKey } = await c.req.json<SecretInput>();
    if (!apiKey) {
        return c.json({ error: "API key is required" }, 400);
    }
    await modelService.updateApiKey(parseInt(modelId), apiKey);
    return c.json({ message: "API key updated" }, 200);
};

export const verifyConfig: Handler = async (c: Context) => {
    const modelService = new ModelService();
    const body = await c.req.json();

    const { provider, baseUrl, model, apiKey } = body;
    switch (provider) {
        case "openai":
            await modelService.verifyOpenAiApi(baseUrl, model, apiKey);
            return c.json({ message: "Config verified" }, 200);
        default:
            return c.json({ error: "Invalid provider" }, 400);
    }
};
