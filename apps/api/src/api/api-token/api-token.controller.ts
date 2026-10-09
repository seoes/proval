import type { Context } from "hono";
import type { ApiTokenCreateInput } from "@proval/types";
import { apiScopeValueList } from "@proval/types";
import { apiTokenService, isScopeListValid } from "./api-token.service.js";
import type { AuthVariables } from "../auth/auth.middleware.js";

type AppContext = Context<{ Variables: AuthVariables }>;

/** A token may never manage token, so every handler here requires a session user. */
function requireSessionUser(c: AppContext) {
    if (c.get("apiScopeList")) {
        return null;
    }
    return c.get("user");
}

export async function findAllApiToken(c: AppContext) {
    const user = requireSessionUser(c);
    if (!user) {
        return c.json({ error: "Session login required to manage api token" }, 403);
    }
    return c.json(await apiTokenService.findAllForUser(user.id));
}

export async function createApiToken(c: AppContext) {
    const user = requireSessionUser(c);
    if (!user) {
        return c.json({ error: "Session login required to manage api token" }, 403);
    }

    const body = (await c.req.json().catch(() => null)) as ApiTokenCreateInput | null;
    if (!body || typeof body.name !== "string" || body.name.trim().length === 0) {
        return c.json({ error: "name is required" }, 400);
    }
    if (!Array.isArray(body.scopeList) || !isScopeListValid(body.scopeList)) {
        return c.json({ error: `scopeList must be a non empty subset of ${apiScopeValueList.join(", ")}` }, 400);
    }

    const created = await apiTokenService.create(user.id, {
        name: body.name.trim(),
        scopeList: body.scopeList,
        expiresInDay: body.expiresInDay ?? null,
    });
    return c.json(created, 201);
}

export async function removeApiToken(c: AppContext) {
    const user = requireSessionUser(c);
    if (!user) {
        return c.json({ error: "Session login required to manage api token" }, 403);
    }
    const id = Number.parseInt(c.req.param("id") ?? "", 10);
    if (!Number.isFinite(id)) {
        return c.json({ error: "invalid id" }, 400);
    }
    const removed = await apiTokenService.remove(user.id, id);
    if (!removed) {
        return c.json({ error: "Not found" }, 404);
    }
    return c.json({ message: "OK" });
}
