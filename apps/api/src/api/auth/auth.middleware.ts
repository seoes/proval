import { createMiddleware } from "hono/factory";
import { getCookie } from "hono/cookie";
import type { ApiScope, UserResponse } from "@proval/types";
import { authService, SESSION_COOKIE_NAME } from "./auth.service.js";
import { apiTokenService } from "../api-token/api-token.service.js";
import { findRequiredScope, isTokenPublicPath } from "../api-token/scope.js";

export type AuthVariables = {
    user: UserResponse | null;
    /** Set only when the caller authenticated with a token, never for a session. */
    apiScopeList: ApiScope[] | null;
};

function readBearerToken(header: string | undefined): string | null {
    if (!header) {
        return null;
    }
    const match = /^Bearer\s+(.+)$/i.exec(header.trim());
    const secret = match?.[1];
    return secret ? secret.trim() : null;
}

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
    if (path === "/health" && (method === "GET" || method === "HEAD")) {
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
    const path = getRequestPath(c.req.path);
    const method = c.req.method;

    const bearer = readBearerToken(c.req.header("Authorization"));
    if (bearer) {
        const authenticated = await apiTokenService.authenticate(bearer);
        if (!authenticated) {
            return c.json({ error: "Invalid api token" }, 401);
        }
        c.set("user", authenticated.user);
        c.set("apiScopeList", authenticated.scopeList);

        if (!isTokenPublicPath(method, path)) {
            const required = findRequiredScope(method, path);
            if (!required) {
                return c.json({ error: "This route is not available to api token" }, 403);
            }
            if (!authenticated.scopeList.includes(required)) {
                return c.json({ error: `Api token is missing the ${required} scope` }, 403);
            }
        }

        await next();
        return;
    }

    const token = getCookie(c, SESSION_COOKIE_NAME);
    let user: UserResponse | null = null;
    if (token) {
        user = await authService.findUserBySessionToken(token);
    }
    c.set("user", user);
    c.set("apiScopeList", null);

    const setting = await authService.getOrCreateInstanceSetting();
    const isSetupRequired = await authService.isSetupRequired();
    const isAuthEnabled = setting.authEnabled;
    const isRegistrationEnabled = setting.registrationEnabled;
    const isLoginRequired = isSetupRequired || isAuthEnabled;

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
