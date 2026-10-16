import { describe, expect, test } from "bun:test";
import { hashSecret, isScopeListValid, parseScopeList } from "./api-token.service.js";

describe("hashSecret", () => {
    test("is stable for the same input", async () => {
        expect(await hashSecret("prv_abc")).toBe(await hashSecret("prv_abc"));
    });

    test("differs for different input", async () => {
        expect(await hashSecret("prv_abc")).not.toBe(await hashSecret("prv_abd"));
    });

    test("produces a 64 character hex digest", async () => {
        const digest = await hashSecret("prv_abc");
        expect(digest).toMatch(/^[0-9a-f]{64}$/);
    });
});

describe("parseScopeList", () => {
    test("reads a comma separated list and trims it", () => {
        expect(parseScopeList("repository:read, activity:read")).toEqual(["repository:read", "activity:read"]);
    });

    test("drops anything not a known scope", () => {
        expect(parseScopeList("repository:read,repository:delete,nonsense")).toEqual(["repository:read"]);
    });

    test("reads an empty column as no scope", () => {
        expect(parseScopeList("")).toEqual([]);
    });
});

describe("isScopeListValid", () => {
    test("rejects an empty list, because a token with no scope can reach nothing", () => {
        expect(isScopeListValid([])).toBe(false);
    });

    test("rejects a list holding an unknown scope", () => {
        expect(isScopeListValid(["repository:read", "repository:delete"])).toBe(false);
    });

    test("accepts a known subset", () => {
        expect(isScopeListValid(["repository:read", "activity:read"])).toBe(true);
    });
});
