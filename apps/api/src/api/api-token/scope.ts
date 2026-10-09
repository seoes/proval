import type { ApiScope } from "@proval/types";

type ScopeRule = {
    method: string;
    /** Matched against the api relative path, with numeric id segments as ":id". */
    pattern: RegExp;
    scope: ApiScope;
};

/**
 * Maps a request onto the scope a token must hold.
 * Anything absent from this list is denied for token auth. A route that grows a
 * new capability therefore stays closed until someone adds it here on purpose,
 * which is safer than inheriting a scope by accident.
 */
const scopeRuleList: ScopeRule[] = [
    { method: "GET", pattern: /^\/repository(\/\d+)?$/, scope: "repository:read" },
    { method: "POST", pattern: /^\/repository$/, scope: "repository:write" },
    { method: "PUT", pattern: /^\/repository\/\d+$/, scope: "repository:write" },
    {
        method: "PATCH",
        pattern: /^\/repository\/\d+\/(webhook-secret|webhook-signing-token)$/,
        scope: "repository:write",
    },
    { method: "POST", pattern: /^\/repository\/\d+\/refresh-path$/, scope: "repository:write" },
    { method: "DELETE", pattern: /^\/repository\/\d+$/, scope: "repository:write" },

    { method: "GET", pattern: /^\/activity(\/\d+)?$/, scope: "activity:read" },
    { method: "GET", pattern: /^\/activity\/summary$/, scope: "activity:read" },
    { method: "GET", pattern: /^\/activity\/\d+\/log$/, scope: "activity:read" },
    { method: "POST", pattern: /^\/activity\/\d+\/(retry|cancel)$/, scope: "activity:write" },

    { method: "GET", pattern: /^\/model-provider(\/\d+)?$/, scope: "model:read" },
    { method: "GET", pattern: /^\/model-provider\/\d+\/model$/, scope: "model:read" },
    { method: "POST", pattern: /^\/model-provider$/, scope: "model:write" },
    { method: "POST", pattern: /^\/model-provider\/verify$/, scope: "model:write" },
    { method: "PUT", pattern: /^\/model-provider\/\d+$/, scope: "model:write" },
    { method: "PATCH", pattern: /^\/model-provider\/\d+\/api-key$/, scope: "model:write" },
    { method: "DELETE", pattern: /^\/model-provider\/\d+$/, scope: "model:write" },

    { method: "GET", pattern: /^\/access(\/\d+)?$/, scope: "access:read" },
    { method: "POST", pattern: /^\/access$/, scope: "access:write" },
    { method: "PUT", pattern: /^\/access\/\d+$/, scope: "access:write" },
    { method: "PATCH", pattern: /^\/access\/\d+\/.*$/, scope: "access:write" },
    { method: "DELETE", pattern: /^\/access\/\d+$/, scope: "access:write" },

    { method: "GET", pattern: /^\/settings$/, scope: "settings:read" },
    { method: "PUT", pattern: /^\/settings$/, scope: "settings:write" },
];

/**
 * The scope a token needs for this request, or null when no rule covers it.
 * A null result means deny, not allow.
 */
export function findRequiredScope(method: string, path: string): ApiScope | null {
    const rule = scopeRuleList.find((candidate) => candidate.method === method && candidate.pattern.test(path));
    return rule ? rule.scope : null;
}

/** Paths a token may reach with no scope at all. */
export function isTokenPublicPath(method: string, path: string): boolean {
    return method === "GET" && (path === "/health" || path === "/auth/me");
}
