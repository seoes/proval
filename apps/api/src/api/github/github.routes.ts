import { Hono } from "hono";
import * as appController from "./app.controller.js";
import * as installationController from "./installation.controller.js";

export const githubRouter = new Hono();

// App routes
githubRouter.get("/app", appController.getGitHubApp);
githubRouter.post("/app", appController.createGitHubApp);
githubRouter.post("/app/test", appController.testGitHubApp);
githubRouter.delete("/app", appController.deleteGitHubApp);
githubRouter.post("/app/callback", appController.handleGitHubAppCallback);
githubRouter.post("/app/setup", installationController.handleSetup);

// App-scoped installation routes
githubRouter.get("/app/:id/installation", installationController.getInstallationList);
githubRouter.get("/app/:id/installation/:installationId", installationController.getInstallation);
githubRouter.get("/app/:id/installation/:installationId/repository", installationController.getRepositoryList);
githubRouter.delete("/app/:id/installation/:installationId", installationController.deleteInstallation);
githubRouter.get("/app/:id/install-url", installationController.getInstallUrl);
