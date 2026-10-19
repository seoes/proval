import { describe, expect, test } from "bun:test";
import { ApiClient, ApiError, buildUrl, describeFailure } from "./client.js";

const credentials = { url: "https://proval.example", token: "secret-token" };

function responseOf(status: number, body: unknown, ok = status < 400): Response {
    return {
        ok,
        status,
        text: async () => (body === undefined ? "" : JSON.stringify(body)),
    } as unknown as Response;
}

describe("buildUrl", () => {
    test("inserts the api prefix exactly once", () => {
        expect(buildUrl("https://x.example", "/repository")).toBe("https://x.example/api/repository");
        expect(buildUrl("https://x.example/", "repository")).toBe("https://x.example/api/repository");
    });

    test("drops query parameters that were not set", () => {
        const url = buildUrl("https://x.example", "/activity", { status: "started", limit: undefined, page: null });
        expect(url).toBe("https://x.example/api/activity?status=started");
    });

    test("encodes values rather than pasting them in", () => {
        const url = buildUrl("https://x.example", "/repository", { path: "group/project name" });
        expect(url).toContain("group%2Fproject+name");
    });
});

describe("describeFailure", () => {
    test("explains a 401 as an authentication problem with the fix", () => {
        const error = describeFailure(401, null);
        expect(error.status).toBe(401);
        expect(error.hint).toContain("auth login");
    });

    test("explains a 403 as a missing scope, not a missing token", () => {
        // The two are easy to confuse and the remedy is different.
        expect(describeFailure(403, null).hint).toContain("scope");
    });

    test("prefers the server's own message when there is one", () => {
        expect(describeFailure(400, { error: "name is required" }).message).toBe("name is required");
    });

    test("falls back to the status when the body carries no message", () => {
        expect(describeFailure(500, {}).message).toContain("500");
    });
});

describe("ApiClient", () => {
    test("sends the bearer token and accepts json", async () => {
        let seenUrl = "";
        let seenInit: RequestInit | undefined;
        const client = new ApiClient(credentials, async (url, init) => {
            seenUrl = url;
            seenInit = init;
            return responseOf(200, [{ id: 1 }]);
        });
        const result = await client.get<{ id: number }[]>("/repository");
        expect(result).toEqual([{ id: 1 }]);
        expect(seenUrl).toBe("https://proval.example/api/repository");
        expect((seenInit?.headers as Record<string, string>).Authorization).toBe("Bearer secret-token");
    });

    test("sends a json body only when there is one", async () => {
        const seen: Array<Record<string, string>> = [];
        const client = new ApiClient(credentials, async (_url, init) => {
            seen.push(init?.headers as Record<string, string>);
            return responseOf(200, {});
        });
        await client.get("/repository");
        await client.put("/repository/1", { prReviewEnabled: false });
        expect(seen[0]!["Content-Type"]).toBeUndefined();
        expect(seen[1]!["Content-Type"]).toBe("application/json");
    });

    test("turns a failure status into an ApiError rather than returning a body", async () => {
        const client = new ApiClient(credentials, async () => responseOf(403, { error: "nope" }, false));
        expect(client.get("/repository")).rejects.toThrow(ApiError);
    });

    test("reports an unreachable instance by name, not as 'fetch failed'", async () => {
        const client = new ApiClient(credentials, async () => {
            throw new Error("connect ECONNREFUSED");
        });
        try {
            await client.get("/repository");
            throw new Error("should have thrown");
        } catch (error) {
            expect(error).toBeInstanceOf(ApiError);
            expect((error as ApiError).status).toBe(0);
            expect((error as ApiError).message).toContain("https://proval.example");
        }
    });

    test("tolerates an empty body on a success", async () => {
        const client = new ApiClient(credentials, async () => responseOf(204, undefined));
        expect(await client.delete("/api-token/1")).toBeNull();
    });

    test("does not crash when an error body is not json", async () => {
        const client = new ApiClient(credentials, async () =>
            ({ ok: false, status: 502, text: async () => "<html>bad gateway</html>" }) as unknown as Response,
        );
        expect(client.get("/repository")).rejects.toThrow(ApiError);
    });
});
