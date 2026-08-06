import { Hono } from "hono";
import {
    getAuthMe,
    loginAuth,
    logoutAuth,
    registerAuth,
    setupAuth,
    getSettings,
    patchSettings,
} from "./auth.controller.js";
import { checkIfAdmin, type AuthVariables } from "./auth.middleware.js";

export const authRouter = new Hono<{ Variables: AuthVariables }>();

authRouter.get("/me", getAuthMe);
authRouter.post("/setup", setupAuth);
authRouter.post("/register", registerAuth);
authRouter.post("/login", loginAuth);
authRouter.post("/logout", logoutAuth);

export const settingsRouter = new Hono<{ Variables: AuthVariables }>();

settingsRouter.get("/", getSettings);
settingsRouter.patch("/", checkIfAdmin, patchSettings);
