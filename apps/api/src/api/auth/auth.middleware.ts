import { createMiddleware } from "hono/factory";
import { getCookie } from "hono/cookie";
import type { ApiScope, UserResponse } from "@proval/types";
import { authService, SESSION_COOKIE_NAME } from "./auth.service.js";
import { apiTokenService } from "../api-token/api-token.service.js";
import { findRequiredScope, isTokenPublicPath } from "../api-token/api-token.scope.js";

export type AuthVariables = {
    user: UserResponse | null;
    /** Set only when the caller authenticated with a token, never for a session. */
    apiScopeList: ApiScope[] | null;
};

export const resolveAuth = createMiddleware<{ Variables: AuthVariables }>(async (c, next) => {
    // apiRouter is mounted at /api so c.req.path may omit or include that prefix.
    const path = c.req.path.startsWith("/api/") ? c.req.path.slice(4) : c.req.path;
    const method = c.req.method;

    const publicPathList = [
        { method: "GET", path: "/health" },
        { method: "HEAD", path: "/health" },
        { method: "GET", path: "/auth/me" },
        { method: "POST", path: "/auth/login" },
        { method: "POST", path: "/auth/logout" },
    ];
    const isPublic = publicPathList.some((item) => item.method === method && item.path === path);

    // Parse api token from authorization header
    const authHeaderStr = c.req.header("Authorization");
    const bearerTokenArray = authHeaderStr ? /^Bearer\s+(.+)$/i.exec(authHeaderStr.trim()) : null;
    const apiToken = bearerTokenArray?.[1]?.trim();
    const isApiToken = apiToken !== undefined;

    // Pass for api token authentication
    if (isApiToken) {
        const authenticated = await apiTokenService.authenticate(apiToken);
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

    // Pass for public paths
    if (isPublic) {
        const sessionToken = getCookie(c, SESSION_COOKIE_NAME);
        const user = sessionToken ? await authService.findUserBySessionToken(sessionToken) : null;
        c.set("user", user);
        c.set("apiScopeList", null);
        await next();
        return;
    }

    const isSetupRequired = await authService.isSetupRequired();
    // If setup is required, only allow setup path
    if (isSetupRequired) {
        // Pass for setup
        if (path === "/auth/setup" && method === "POST") {
            await next();
            return;
        }
        // Block all other paths
        return c.json({ error: "Initial setup required", code: "setup_required" }, 403);
    }

    const settings = await authService.getOrCreateInstanceSetting();

    // Pass for registration if enabled
    if (settings.authEnabled && settings.registrationEnabled && path === "/auth/register" && method === "POST") {
        await next();
        return;
    }

    const sessionToken = getCookie(c, SESSION_COOKIE_NAME);
    const user = sessionToken ? await authService.findUserBySessionToken(sessionToken) : null;
    c.set("user", user);
    c.set("apiScopeList", null);

    // Pass if auth is disabled
    if (!settings.authEnabled) {
        await next();
        return;
    }

    // Block if auth is enabled but not authenticated
    if (!user) {
        return c.json({ error: "Unauthorized" }, 401);
    }

    // Pass if auth is enabled and authenticated
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
