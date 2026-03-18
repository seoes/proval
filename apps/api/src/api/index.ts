import { Hono } from "hono";
import {
    findAllRepositoryController,
    findById as findRepositoryById,
    createRepository,
    updateRepository,
    updateApiToken,
    updateWebhookSecret,
} from "./repository/repository.controller.js";
import { findAllModel, findById, createModel, updateModel, updateApiKey } from "./model/model.controller.js";

export const apiRouter = new Hono();

// Model routes
apiRouter.get("/model", findAllModel);
apiRouter.get("/model/:id", findById);
apiRouter.post("/model", createModel);
apiRouter.put("/model/:id", updateModel);
apiRouter.patch("/model/:id/api-key", updateApiKey);

// Repository routes
apiRouter.get("/repository", findAllRepositoryController);
apiRouter.get("/repository/:id", findRepositoryById);
apiRouter.post("/repository", createRepository);
apiRouter.put("/repository/:id", updateRepository);
apiRouter.patch("/repository/:id/api-token", updateApiToken);
apiRouter.patch("/repository/:id/webhook-secret", updateWebhookSecret);
