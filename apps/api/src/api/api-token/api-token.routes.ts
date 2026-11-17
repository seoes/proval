import { Hono } from "hono";
import { createApiToken, findAllApiToken, removeApiToken } from "./api-token.controller.js";
import type { AuthVariables } from "../auth/auth.middleware.js";

export const apiTokenRouter = new Hono<{ Variables: AuthVariables }>();

apiTokenRouter.get("/", findAllApiToken);
apiTokenRouter.post("/", createApiToken);
apiTokenRouter.delete("/:id{\\d+}", removeApiToken);
