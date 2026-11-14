import { describe, expect, test } from "bun:test";
import { apiTokenService } from "./api-token.service.js";

describe("hashSecret", () => {
    test("is stable for the same input", async () => {
        expect(await apiTokenService.hashSecret("prv_abc")).toBe(await apiTokenService.hashSecret("prv_abc"));
    });

    test("differs for different input", async () => {
        expect(await apiTokenService.hashSecret("prv_abc")).not.toBe(await apiTokenService.hashSecret("prv_abd"));
    });

    test("produces a 64 character hex digest", async () => {
        const digest = await apiTokenService.hashSecret("prv_abc");
        expect(digest).toMatch(/^[0-9a-f]{64}$/);
    });
});

describe("parseScopeList", () => {
    test("reads a comma separated list and trims it", () => {
        expect(apiTokenService.parseScopeList("repository:read, activity:read")).toEqual([
            "repository:read",
            "activity:read",
        ]);
    });

    test("drops anything not a known scope", () => {
        expect(apiTokenService.parseScopeList("repository:read,repository:delete,nonsense")).toEqual([
            "repository:read",
        ]);
    });

    test("reads an empty column as no scope", () => {
        expect(apiTokenService.parseScopeList("")).toEqual([]);
    });
});

describe("isScopeListValid", () => {
    test("rejects an empty list, because a token with no scope can reach nothing", () => {
        expect(apiTokenService.isScopeListValid([])).toBe(false);
    });

    test("rejects a list holding an unknown scope", () => {
        expect(apiTokenService.isScopeListValid(["repository:read", "repository:delete"])).toBe(false);
    });

    test("accepts a known subset", () => {
        expect(apiTokenService.isScopeListValid(["repository:read", "activity:read"])).toBe(true);
    });
});

describe("ApiTokenService.create", () => {
    test("rejects zero and negatives rather than reading them as no expiry", async () => {
        await expect(
            apiTokenService.create("user", { name: "t", scopeList: ["repository:read"], expiresInDay: 0 }),
        ).rejects.toThrow("expiresInDay");
        await expect(
            apiTokenService.create("user", { name: "t", scopeList: ["repository:read"], expiresInDay: -1 }),
        ).rejects.toThrow("expiresInDay");
    });

    test("rejects a value that is not a whole number of days", async () => {
        await expect(
            apiTokenService.create("user", {
                name: "t",
                scopeList: ["repository:read"],
                expiresInDay: "30" as unknown as number,
            }),
        ).rejects.toThrow("expiresInDay");
        await expect(
            apiTokenService.create("user", { name: "t", scopeList: ["repository:read"], expiresInDay: 1.5 }),
        ).rejects.toThrow("expiresInDay");
        await expect(
            apiTokenService.create("user", { name: "t", scopeList: ["repository:read"], expiresInDay: Number.NaN }),
        ).rejects.toThrow("expiresInDay");
    });

    test("rejects values that would overflow the expiry date", async () => {
        await expect(
            apiTokenService.create("user", { name: "t", scopeList: ["repository:read"], expiresInDay: 36501 }),
        ).rejects.toThrow("expiresInDay");
        await expect(
            apiTokenService.create("user", {
                name: "t",
                scopeList: ["repository:read"],
                expiresInDay: Number.MAX_SAFE_INTEGER,
            }),
        ).rejects.toThrow("expiresInDay");
    });

    test("names the accepted range in the message, so the caller can correct it", async () => {
        await expect(
            apiTokenService.create("user", { name: "t", scopeList: ["repository:read"], expiresInDay: 0 }),
        ).rejects.toThrow("36500");
    });

    test("the maximum day count still produces a valid date", () => {
        const at = new Date(Date.now() + 36500 * 24 * 60 * 60 * 1000);
        expect(Number.isNaN(at.getTime())).toBe(false);
    });
});
