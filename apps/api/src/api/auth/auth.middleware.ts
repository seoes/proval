import { createMiddleware } from "hono/factory";
import { getCookie } from "hono/cookie";
import type { UserResponse } from "@proval/types";
import { authService, SESSION_COOKIE_NAME } from "./auth.service.js";

export type AuthVariables = {
    user: UserResponse | null;
};

function getRequestPath(path: string): string {
    // apiRouter is mounted at /api, so c.req.path may be /auth/me or /api/auth/me depending on version
    if (path.startsWith("/api/")) {
        return path.slice(4);
    }
    return path;
}

function isPublicAuthPath(
    path: string,
    method: string,
    isSetupRequired: boolean,
    isAuthEnabled: boolean,
    isRegistrationEnabled: boolean,
): boolean {
    if (path === "/health" && method === "GET") {
        return true;
    }
    if (path === "/auth/me" && method === "GET") {
        return true;
    }
    if (path === "/auth/login" && method === "POST") {
        return true;
    }
    if (path === "/auth/logout" && method === "POST") {
        return true;
    }
    if (path === "/auth/setup" && method === "POST" && isSetupRequired) {
        return true;
    }
    if (path === "/auth/register" && method === "POST" && isAuthEnabled && isRegistrationEnabled) {
        return true;
    }
    return false;
}

export const resolveAuth = createMiddleware<{ Variables: AuthVariables }>(async (c, next) => {
    const token = getCookie(c, SESSION_COOKIE_NAME);
    let user: UserResponse | null = null;
    if (token) {
        user = await authService.findUserBySessionToken(token);
    }
    c.set("user", user);

    const setting = await authService.getOrCreateInstanceSetting();
    const isSetupRequired = await authService.isSetupRequired();
    const isAuthEnabled = setting.authEnabled;
    const isRegistrationEnabled = setting.registrationEnabled;
    const isLoginRequired = isSetupRequired || isAuthEnabled;

    const path = getRequestPath(c.req.path);
    const method = c.req.method;
    const isPublic = isPublicAuthPath(path, method, isSetupRequired, isAuthEnabled, isRegistrationEnabled);

    if (isSetupRequired && !isPublic) {
        return c.json({ error: "Initial setup required", code: "setup_required" }, 403);
    }

    if (isLoginRequired && !user && !isPublic) {
        return c.json({ error: "Unauthorized" }, 401);
    }

    await next();
});

export const checkIfAdmin = createMiddleware<{ Variables: AuthVariables }>(async (c, next) => {
    const user = c.get("user");
    if (!user) {
        return c.json({ error: "Unauthorized" }, 401);
    }
    if (user.role !== "admin") {
        return c.json({ error: "Admin access required" }, 403);
    }
    await next();
});
