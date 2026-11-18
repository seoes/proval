import { describe, expect, it } from "bun:test";
import OpenAI from "openai";
import { classifyModelError } from "./retryable-error.js";

describe("classifyModelError", () => {
    it("keeps 429 and 400 as rate failures", () => {
        expect(classifyModelError({ status: 429 })).toBe("rate");
        expect(classifyModelError({ status: 400 })).toBe("rate");
    });

    it("treats server and gateway errors as transient", () => {
        for (const status of [408, 500, 502, 503, 504]) expect(classifyModelError({ status })).toBe("transient");
    });

    it("fails at once on auth and other client errors", () => {
        for (const status of [401, 403, 404, 422]) expect(classifyModelError({ status })).toBeNull();
    });

    it("retries the SDK's timeout error, which has no status", () => {
        expect(classifyModelError(new OpenAI.APIConnectionTimeoutError())).toBe("transient");
    });

    it("retries a reset socket from Bun's fetch", () => {
        const error = Object.assign(
            new Error("The socket connection was closed unexpectedly. For more information, pass `verbose: true`"),
            { code: "ECONNRESET" },
        );
        expect(classifyModelError(error)).toBe("transient");
    });

    it("looks through the cause chain", () => {
        const cause = Object.assign(new Error("connect"), { code: "ECONNREFUSED" });
        expect(classifyModelError(new Error("Connection error.", { cause }))).toBe("transient");
    });

    it("does not retry an ordinary bug", () => {
        expect(classifyModelError(new TypeError("cannot read properties of undefined"))).toBeNull();
        expect(classifyModelError("boom")).toBeNull();
    });
});
