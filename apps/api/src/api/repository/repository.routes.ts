import { Hono } from "hono";
import {
    findAllRepositoryController,
    findById as findRepositoryById,
    createRepository,
    updateRepository,
    updateWebhookSecret,
    updateWebhookSigningToken,
    refreshRepositoryPath,
    removeRepository,
} from "./repository.controller.js";

export const repositoryRouter = new Hono();

repositoryRouter.get("/", findAllRepositoryController);
repositoryRouter.get("/:id", findRepositoryById);
repositoryRouter.post("/", createRepository);
repositoryRouter.put("/:id", updateRepository);
repositoryRouter.patch("/:id/webhook-secret", updateWebhookSecret);
repositoryRouter.patch("/:id/webhook-signing-token", updateWebhookSigningToken);
repositoryRouter.post("/:id/refresh-path", refreshRepositoryPath);
repositoryRouter.delete("/:id", removeRepository);
