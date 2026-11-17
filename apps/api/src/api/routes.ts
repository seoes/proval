import { Hono } from "hono";
import { githubRouter } from "./github/github.routes.js";
import { accessRouter } from "./access/access.routes.js";
import { modelProviderRouter } from "./model/model.routes.js";
import { repositoryRouter } from "./repository/repository.routes.js";
import { activityRouter } from "./activity/activity.routes.js";
import { authRouter, settingsRouter } from "./auth/auth.routes.js";
import { apiTokenRouter } from "./api-token/api-token.routes.js";
import { findUserList, removeUser } from "./auth/auth.controller.js";
import { checkIfAdmin, resolveAuth, type AuthVariables } from "./auth/auth.middleware.js";
import { findCatalogModel } from "./catalog/catalog.controller.js";

export const apiRouter = new Hono<{ Variables: AuthVariables }>();

apiRouter.use("*", resolveAuth);

// Health check routes
apiRouter.get("/health", (c) => {
    return c.json({ message: "OK" }, 200);
});

apiRouter.route("/auth", authRouter);
apiRouter.route("/settings", settingsRouter);
apiRouter.route("/api-token", apiTokenRouter);

apiRouter.get("/user", checkIfAdmin, findUserList);
apiRouter.delete("/user/:id", checkIfAdmin, removeUser);

// Model provider routes
apiRouter.route("/model-provider", modelProviderRouter);

apiRouter.get("/catalog/model", findCatalogModel);

// Repository routes
apiRouter.route("/repository", repositoryRouter);

// GitHub routes
apiRouter.route("/github", githubRouter);

// Access routes
apiRouter.route("/access", accessRouter);

// Activity routes
apiRouter.route("/activity", activityRouter);
