import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { AuthCredentialInput, InstanceSettingUpdateInput } from "@proval/types";
import { authService, SESSION_COOKIE_NAME } from "./auth.service.js";
import type { AuthVariables } from "./auth.middleware.js";

function sessionSettings() {
    return {
        path: "/",
        httpOnly: true,
        sameSite: "Lax" as const,
        secure: process.env.NODE_ENV === "production",
    };
}

function setSessionCookie(c: Context, token: string, expiresAt: Date) {
    setCookie(c, SESSION_COOKIE_NAME, token, { ...sessionSettings(), expires: expiresAt });
}

function clearSessionCookie(c: Context) {
    deleteCookie(c, SESSION_COOKIE_NAME, { ...sessionSettings() });
}

export const getAuthMe = async (c: Context<{ Variables: AuthVariables }>) => {
    const user = c.get("user") ?? null;
    const me = await authService.getMe(user);
    return c.json(me, 200);
};

export const setupAuth = async (c: Context<{ Variables: AuthVariables }>) => {
    const body = await c.req.json<AuthCredentialInput>();
    try {
        const result = await authService.createInitialAdmin(body);
        setSessionCookie(c, result.token, result.expiresAt);
        return c.json({ user: result.user }, 201);
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg === "Setup already completed") {
            return c.json({ error: msg }, 409);
        }
        if (msg === "Email and password are required" || msg === "Password must be at least 8 characters") {
            return c.json({ error: msg }, 400);
        }
        if (msg === "Email already registered") {
            return c.json({ error: msg }, 409);
        }
        throw e;
    }
};

export const registerAuth = async (c: Context<{ Variables: AuthVariables }>) => {
    const body = await c.req.json<AuthCredentialInput>();
    try {
        const result = await authService.registerUser(body);
        setSessionCookie(c, result.token, result.expiresAt);
        return c.json({ user: result.user }, 201);
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (
            msg === "Initial setup required" ||
            msg === "Registration requires authentication to be enabled" ||
            msg === "Registration is disabled"
        ) {
            return c.json({ error: msg }, 403);
        }
        if (msg === "Email and password are required" || msg === "Password must be at least 8 characters") {
            return c.json({ error: msg }, 400);
        }
        if (msg === "Email already registered") {
            return c.json({ error: msg }, 409);
        }
        throw e;
    }
};

export const loginAuth = async (c: Context<{ Variables: AuthVariables }>) => {
    const body = await c.req.json<AuthCredentialInput>();
    try {
        const result = await authService.login(body);
        setSessionCookie(c, result.token, result.expiresAt);
        return c.json({ user: result.user }, 200);
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg === "Email and password are required") {
            return c.json({ error: msg }, 400);
        }
        if (msg === "Invalid email or password") {
            return c.json({ error: msg }, 401);
        }
        throw e;
    }
};

export const logoutAuth = async (c: Context<{ Variables: AuthVariables }>) => {
    const token = getCookie(c, SESSION_COOKIE_NAME);
    if (token) {
        await authService.deleteSession(token);
    }
    clearSessionCookie(c);
    return c.json({ ok: true }, 200);
};

export const getSettings = async (c: Context<{ Variables: AuthVariables }>) => {
    const setting = await authService.getOrCreateInstanceSetting();
    return c.json(authService.toInstanceSettingResponse(setting), 200);
};

export const putSettings = async (c: Context<{ Variables: AuthVariables }>) => {
    const body = await c.req.json<InstanceSettingUpdateInput>();
    try {
        const updated = await authService.updateInstanceSetting(body);
        return c.json(updated, 200);
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (
            msg === "Registration cannot be enabled while authentication is disabled" ||
            msg === "isAuthEnabled and isRegistrationEnabled are required"
        ) {
            return c.json({ error: msg }, 400);
        }
        throw e;
    }
};
