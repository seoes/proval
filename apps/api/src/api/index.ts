import { Hono, type Handler } from "hono";
import { findAllRepositoryController } from "./repository/repository.controller.js";
import { RepositoryService } from "./repository/repository.service.js";
import { findAllModel } from "./model/model.controller.js";

export const apiRouter = new Hono();

apiRouter.get("/model", findAllModel);

apiRouter.get("/repository", findAllRepositoryController);
