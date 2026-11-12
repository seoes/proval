import type { Handler } from "hono";
import { CatalogService } from "./catalog.service.js";

const catalogService = new CatalogService();

export const findCatalogModel: Handler = async (c) => {
    const id = c.req.query("id");
    if (id == null || id.trim() === "") {
        return c.json({ error: "Model id is required" }, 400);
    }
    const model = await catalogService.matchModel(id);
    if (model) {
        return c.json(model, 200);
    }
    return c.json({ error: "Model not found" }, 404);
};
