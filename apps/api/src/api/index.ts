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
    findAllModel,
    findById,
    createModel,
    updateModel,
    updateApiKey,
    verifyConfig,
    removeModel,
} from "./model/model.controller.js";
import { githubRouter } from "./github/index.js";
import { accessRouter } from "./access/index.js";
import { findAllActivity, findActivityById, getActivitySummary } from "./activity/activity.controller.js";

export const apiRouter = new Hono();

// Health check routes
apiRouter.get("/health", (c) => {
    return c.json({ message: "OK" }, 200);
});

// Model routes
apiRouter.get("/model", findAllModel);
apiRouter.get("/model/:id{\\d+}", findById);
apiRouter.post("/model", createModel);
apiRouter.post("/model/verify", verifyConfig);
apiRouter.delete("/model/:id", removeModel);
apiRouter.put("/model/:id", updateModel);
apiRouter.patch("/model/:id/api-key", updateApiKey);

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
apiRouter.get("/activity/:id{\\d+}", findActivityById);
