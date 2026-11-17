import { describe, expect, test } from "bun:test";
import { apiTokenService } from "./api-token.service.js";

const MAX_EXPIRES_IN_DAY = 36500;

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

describe("validateExpiresInDay", () => {
    test("accepts an absent expiry, which means the token never expires", () => {
        expect(apiTokenService.validateExpiresInDay(null)).toBeNull();
        expect(apiTokenService.validateExpiresInDay(undefined)).toBeNull();
    });

    test("accepts a positive whole number of days", () => {
        expect(apiTokenService.validateExpiresInDay(1)).toBeNull();
        expect(apiTokenService.validateExpiresInDay(90)).toBeNull();
        expect(apiTokenService.validateExpiresInDay(MAX_EXPIRES_IN_DAY)).toBeNull();
    });

    test("rejects zero and negatives rather than reading them as no expiry", () => {
        // The service treats these as falsy and mints a permanent token, which
        // is the failure this validator exists to prevent.
        expect(apiTokenService.validateExpiresInDay(0)).not.toBeNull();
        expect(apiTokenService.validateExpiresInDay(-1)).not.toBeNull();
    });

    test("rejects a value that is not a number", () => {
        expect(apiTokenService.validateExpiresInDay("abc")).not.toBeNull();
        expect(apiTokenService.validateExpiresInDay("30")).not.toBeNull();
        expect(apiTokenService.validateExpiresInDay(true)).not.toBeNull();
        expect(apiTokenService.validateExpiresInDay({})).not.toBeNull();
    });

    test("rejects a fractional day count", () => {
        expect(apiTokenService.validateExpiresInDay(1.5)).not.toBeNull();
    });

    test("rejects values that would overflow the expiry date", () => {
        // Date.now() plus this many milliseconds is not a representable date,
        // so the insert would receive an Invalid Date.
        expect(apiTokenService.validateExpiresInDay(Number.MAX_SAFE_INTEGER)).not.toBeNull();
        expect(apiTokenService.validateExpiresInDay(MAX_EXPIRES_IN_DAY + 1)).not.toBeNull();
        expect(apiTokenService.validateExpiresInDay(Number.POSITIVE_INFINITY)).not.toBeNull();
        expect(apiTokenService.validateExpiresInDay(Number.NaN)).not.toBeNull();
    });

    test("names the accepted range in the message, so the caller can correct it", () => {
        expect(apiTokenService.validateExpiresInDay(0)).toContain(String(MAX_EXPIRES_IN_DAY));
    });
});

describe("the bound is actually safe", () => {
    test("the maximum day count still produces a valid date", () => {
        const at = new Date(Date.now() + MAX_EXPIRES_IN_DAY * 24 * 60 * 60 * 1000);
        expect(Number.isNaN(at.getTime())).toBe(false);
    });
});
