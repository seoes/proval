import { Hono } from "hono";
import {
    findAllRepositoryController,
    findById as findRepositoryById,
    createRepository,
    updateRepository,
    updateWebhookSecret,
    refreshRepositoryPath,
    removeRepository,
} from "./repository/repository.controller.js";
import {
    findAllModelProvider,
    findModelProviderById,
    listModelProviderModels,
    createModelProvider,
    updateModelProvider,
    updateModelProviderApiKey,
    verifyModelProviderConfig,
    removeModelProvider,
} from "./model/model.controller.js";
import { githubRouter } from "./github/index.js";
import { accessRouter } from "./access/index.js";
import {
    findAllActivity,
    findActivityById,
    findActivityLogById,
    getActivitySummary,
} from "./activity/activity.controller.js";

export const apiRouter = new Hono();

// Health check routes
apiRouter.get("/health", (c) => {
    return c.json({ message: "OK" }, 200);
});

// Model provider routes
apiRouter.get("/model-provider", findAllModelProvider);
apiRouter.get("/model-provider/:id{\\d+}/model", listModelProviderModels);
apiRouter.get("/model-provider/:id{\\d+}", findModelProviderById);
apiRouter.post("/model-provider", createModelProvider);
apiRouter.post("/model-provider/verify", verifyModelProviderConfig);
apiRouter.delete("/model-provider/:id", removeModelProvider);
apiRouter.put("/model-provider/:id", updateModelProvider);
apiRouter.patch("/model-provider/:id/api-key", updateModelProviderApiKey);

// Repository routes
apiRouter.get("/repository", findAllRepositoryController);
apiRouter.get("/repository/:id", findRepositoryById);
apiRouter.post("/repository", createRepository);
apiRouter.put("/repository/:id", updateRepository);
apiRouter.patch("/repository/:id/webhook-secret", updateWebhookSecret);
apiRouter.post("/repository/:id/refresh-path", refreshRepositoryPath);
apiRouter.delete("/repository/:id", removeRepository);

// GitHub routes
apiRouter.route("/github", githubRouter);

// Access routes
apiRouter.route("/access", accessRouter);

// Activity routes
apiRouter.get("/activity/summary", getActivitySummary);
apiRouter.get("/activity", findAllActivity);
apiRouter.get("/activity/:id{\\d+}/log", findActivityLogById);
apiRouter.get("/activity/:id{\\d+}", findActivityById);
