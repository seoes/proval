import { describe, expect, test } from "bun:test";
import { apiScopeValueList } from "@proval/types";
import { findRequiredScope, isTokenPublicPath } from "./scope.js";

describe("findRequiredScope", () => {
    test("maps read and write on the same resource to different scope", () => {
        expect(findRequiredScope("GET", "/repository")).toBe("repository:read");
        expect(findRequiredScope("POST", "/repository")).toBe("repository:write");
        expect(findRequiredScope("DELETE", "/repository/7")).toBe("repository:write");
    });

    test("treats the model provider api key route as a write", () => {
        expect(findRequiredScope("PATCH", "/model-provider/3/api-key")).toBe("model:write");
    });

    test("separates reading settings from changing them", () => {
        expect(findRequiredScope("GET", "/settings")).toBe("settings:read");
        expect(findRequiredScope("PUT", "/settings")).toBe("settings:write");
    });

    test("covers every access route, so a scoped token is not denied one by omission", () => {
        // Each of these is registered in access/index.ts. A missing rule here
        // does not fail open, it fails closed with a 403 that looks like a
        // permission problem rather than a gap in this table.
        expect(findRequiredScope("GET", "/access")).toBe("access:read");
        expect(findRequiredScope("GET", "/access/4")).toBe("access:read");
        expect(findRequiredScope("GET", "/access/4/repository")).toBe("access:read");
        expect(findRequiredScope("POST", "/access")).toBe("access:write");
        expect(findRequiredScope("POST", "/access/test")).toBe("access:write");
        expect(findRequiredScope("POST", "/access/4/test")).toBe("access:write");
        expect(findRequiredScope("PUT", "/access/4")).toBe("access:write");
        expect(findRequiredScope("PATCH", "/access/4/access-token")).toBe("access:write");
        expect(findRequiredScope("DELETE", "/access/4")).toBe("access:write");
    });

    test("does not let the access test route swallow a numeric id", () => {
        // "/access/test" and "/access/4/test" are different rules, and neither
        // should match a path the other owns.
        expect(findRequiredScope("POST", "/access/4/repository")).toBeNull();
        expect(findRequiredScope("GET", "/access/test")).toBeNull();
    });

    test("covers every activity read route, including the status poll a client waits on", () => {
        expect(findRequiredScope("GET", "/activity")).toBe("activity:read");
        expect(findRequiredScope("GET", "/activity/12")).toBe("activity:read");
        expect(findRequiredScope("GET", "/activity/12/log")).toBe("activity:read");
        expect(findRequiredScope("GET", "/activity/12/status")).toBe("activity:read");
        expect(findRequiredScope("POST", "/activity/12/cancel")).toBe("activity:write");
    });

    test("returns null for a route no rule covers, so the caller denies it", () => {
        expect(findRequiredScope("GET", "/github/app")).toBeNull();
        expect(findRequiredScope("POST", "/github/installation")).toBeNull();
    });

    test("returns null for token management, so a token cannot mint a token", () => {
        expect(findRequiredScope("GET", "/api-token")).toBeNull();
        expect(findRequiredScope("POST", "/api-token")).toBeNull();
        expect(findRequiredScope("DELETE", "/api-token/1")).toBeNull();
    });

    test("returns null for the login and logout route", () => {
        expect(findRequiredScope("POST", "/auth/login")).toBeNull();
        expect(findRequiredScope("POST", "/auth/logout")).toBeNull();
        expect(findRequiredScope("POST", "/auth/setup")).toBeNull();
    });

    test("does not confuse a longer path with a mapped prefix", () => {
        expect(findRequiredScope("GET", "/repository/7/secret")).toBeNull();
        expect(findRequiredScope("POST", "/activity/7/something-new")).toBeNull();
    });

    test("every scope in the public list is reachable by some route", () => {
        const sampleList: { method: string; path: string }[] = [
            { method: "GET", path: "/repository" },
            { method: "POST", path: "/repository" },
            { method: "GET", path: "/activity" },
            { method: "POST", path: "/activity/1/retry" },
            { method: "GET", path: "/model-provider" },
            { method: "PATCH", path: "/model-provider/1/api-key" },
            { method: "GET", path: "/access" },
            { method: "POST", path: "/access" },
            { method: "GET", path: "/settings" },
            { method: "PUT", path: "/settings" },
        ];
        const reachable = new Set(
            apiScopeValueList.filter((scope) =>
                sampleList.some((sample) => findRequiredScope(sample.method, sample.path) === scope),
            ),
        );
        expect([...reachable].sort()).toEqual([...apiScopeValueList].sort());
    });
});

describe("isTokenPublicPath", () => {
    test("allows health and identity without a scope", () => {
        expect(isTokenPublicPath("GET", "/health")).toBe(true);
        expect(isTokenPublicPath("GET", "/auth/me")).toBe(true);
    });

    test("allows nothing else", () => {
        expect(isTokenPublicPath("GET", "/repository")).toBe(false);
        expect(isTokenPublicPath("POST", "/health")).toBe(false);
    });
});
