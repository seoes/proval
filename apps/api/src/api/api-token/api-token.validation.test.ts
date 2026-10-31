import { describe, expect, test } from "bun:test";
import { MAX_EXPIRES_IN_DAY, validateExpiresInDay } from "./api-token.validation.js";

describe("validateExpiresInDay", () => {
    test("accepts an absent expiry, which means the token never expires", () => {
        expect(validateExpiresInDay(null)).toBeNull();
        expect(validateExpiresInDay(undefined)).toBeNull();
    });

    test("accepts a positive whole number of days", () => {
        expect(validateExpiresInDay(1)).toBeNull();
        expect(validateExpiresInDay(90)).toBeNull();
        expect(validateExpiresInDay(MAX_EXPIRES_IN_DAY)).toBeNull();
    });

    test("rejects zero and negatives rather than reading them as no expiry", () => {
        // The service treats these as falsy and mints a permanent token, which
        // is the failure this validator exists to prevent.
        expect(validateExpiresInDay(0)).not.toBeNull();
        expect(validateExpiresInDay(-1)).not.toBeNull();
    });

    test("rejects a value that is not a number", () => {
        expect(validateExpiresInDay("abc")).not.toBeNull();
        expect(validateExpiresInDay("30")).not.toBeNull();
        expect(validateExpiresInDay(true)).not.toBeNull();
        expect(validateExpiresInDay({})).not.toBeNull();
    });

    test("rejects a fractional day count", () => {
        expect(validateExpiresInDay(1.5)).not.toBeNull();
    });

    test("rejects values that would overflow the expiry date", () => {
        // Date.now() plus this many milliseconds is not a representable date,
        // so the insert would receive an Invalid Date.
        expect(validateExpiresInDay(Number.MAX_SAFE_INTEGER)).not.toBeNull();
        expect(validateExpiresInDay(MAX_EXPIRES_IN_DAY + 1)).not.toBeNull();
        expect(validateExpiresInDay(Number.POSITIVE_INFINITY)).not.toBeNull();
        expect(validateExpiresInDay(Number.NaN)).not.toBeNull();
    });

    test("names the accepted range in the message, so the caller can correct it", () => {
        expect(validateExpiresInDay(0)).toContain(String(MAX_EXPIRES_IN_DAY));
    });
});

describe("the bound is actually safe", () => {
    test("the maximum day count still produces a valid date", () => {
        const at = new Date(Date.now() + MAX_EXPIRES_IN_DAY * 24 * 60 * 60 * 1000);
        expect(Number.isNaN(at.getTime())).toBe(false);
    });
});
