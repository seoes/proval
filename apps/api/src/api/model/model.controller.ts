import type { Handler } from "hono";
import { ModelService } from "./model.service.js";
import type { ModelResponse } from "@code-review/types";

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
