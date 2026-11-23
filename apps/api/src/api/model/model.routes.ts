import { Hono } from "hono";
import {
    findAllModelProvider,
    findModelProviderById,
    listModelProviderModels,
    createModelProvider,
    updateModelProvider,
    updateModelProviderApiKey,
    verifyModelProviderConfig,
    removeModelProvider,
    startOAuth,
    getOAuth,
    cancelOAuth,
    verifySavedModelProvider,
    resetModelProviderQuota,
} from "./model.controller.js";
import type { AuthVariables } from "../auth/auth.middleware.js";

export const modelProviderRouter = new Hono<{ Variables: AuthVariables }>();

modelProviderRouter.post("/oauth/attempt", startOAuth);
modelProviderRouter.get("/oauth/attempt/:attemptId", getOAuth);
modelProviderRouter.delete("/oauth/attempt/:attemptId", cancelOAuth);
modelProviderRouter.post("/:id{\\d+}/verify", verifySavedModelProvider);
modelProviderRouter.get("/", findAllModelProvider);
modelProviderRouter.get("/:id{\\d+}/model", listModelProviderModels);
modelProviderRouter.get("/:id{\\d+}", findModelProviderById);
modelProviderRouter.post("/", createModelProvider);
modelProviderRouter.post("/verify", verifyModelProviderConfig);
modelProviderRouter.delete("/:id", removeModelProvider);
modelProviderRouter.put("/:id", updateModelProvider);
modelProviderRouter.patch("/:id/api-key", updateModelProviderApiKey);
modelProviderRouter.post("/:id/rate-limit/reset", resetModelProviderQuota);
