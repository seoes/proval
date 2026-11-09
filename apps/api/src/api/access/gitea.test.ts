import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { GitLabAccessService } from "./access.service";

describe("Gitea connection test service", () => {
    let accessService: GitLabAccessService;
    let mockServer: ReturnType<typeof Bun.serve> | null = null;
    let receivedAuthHeader = "";
    let receivedPath = "";
    let mockResponseStatus = 200;
    let mockResponseBody: unknown = {};
    let mockDelayMs = 0;

    beforeEach(() => {
        accessService = new GitLabAccessService();
        receivedAuthHeader = "";
        receivedPath = "";
        mockResponseStatus = 200;
        mockResponseBody = {
            id: 1,
            login: "alice_gitea",
            username: "alice_gitea",
            full_name: "Alice Gitea",
            email: "alice@example.com",
            active: true,
            prohibit_login: false,
        };
        mockDelayMs = 0;
    });

    afterEach(() => {
        if (mockServer) {
            mockServer.stop(true);
            mockServer = null;
        }
    });

    function startMockGiteaServer(customHandler?: (req: Request) => Response | Promise<Response>) {
        mockServer = Bun.serve({
            hostname: "127.0.0.1",
            port: 0,
            async fetch(req) {
                if (customHandler) {
                    return customHandler(req);
                }
                const url = new URL(req.url);
                receivedPath = url.pathname;
                receivedAuthHeader = req.headers.get("authorization") || "";

                if (mockDelayMs > 0) {
                    await new Promise((resolve) => setTimeout(resolve, mockDelayMs));
                }

                return new Response(JSON.stringify(mockResponseBody), {
                    status: mockResponseStatus,
                    headers: { "Content-Type": "application/json" },
                });
            },
        });
        return `http://127.0.0.1:${mockServer.port}`;
    }

    it("successfully tests connection with valid token using GET /api/v1/user", async () => {
        const baseUrl = startMockGiteaServer();
        const testToken = "test_gitea_pat_secret_12345";

        const result = await accessService.testGitea(baseUrl, testToken);

        expect(result.success).toBe(true);
        expect(result.username).toBe("alice_gitea");
        expect(result.message).toContain("alice_gitea");
        expect(receivedPath).toBe("/api/v1/user");
        expect(receivedAuthHeader).toBe(`token ${testToken}`);
    });

    it("returns error on invalid token 401 without exposing the secret token", async () => {
        const baseUrl = startMockGiteaServer();
        const secretToken = "super_secret_pat_99999";
        mockResponseStatus = 401;
        mockResponseBody = { message: "token is not valid" };

        const result = await accessService.testGitea(baseUrl, secretToken);

        expect(result.success).toBe(false);
        expect(result.message.toLowerCase()).toContain("unauthorized");
        expect(result.message).not.toContain(secretToken);
    });

    it("returns error on 404 incorrect URL", async () => {
        const baseUrl = startMockGiteaServer();
        mockResponseStatus = 404;
        mockResponseBody = { message: "404 page not found" };

        const result = await accessService.testGitea(baseUrl, "any_token");

        expect(result.success).toBe(false);
        expect(result.message).toContain("404");
    });

    it("returns error when Gitea instance is unreachable", async () => {
        // Connect to a port where nothing is listening
        const deadUrl = "http://127.0.0.1:59998";
        const result = await accessService.testGitea(deadUrl, "any_token");

        expect(result.success).toBe(false);
        expect(result.message.toLowerCase()).toContain("unreachable");
    });

    it("returns error when connection times out", async () => {
        const baseUrl = startMockGiteaServer();
        mockDelayMs = 200; // Delay longer than our passed timeout

        const result = await accessService.testGitea(baseUrl, "any_token", 50);

        expect(result.success).toBe(false);
        expect(result.message.toLowerCase()).toContain("timed out");
    });

    it("returns error on SSL certificate failure", async () => {
        // Test helper that simulates SSL error handling
        const originalFetch = globalThis.fetch;
        try {
            globalThis.fetch = async () => {
                const sslError = new Error("self signed certificate in certificate chain");
                (sslError as unknown as { code: string }).code = "SELF_SIGNED_CERT_IN_CHAIN";
                throw sslError;
            };

            const result = await accessService.testGitea("https://gitea.selfsigned.local", "token");
            expect(result.success).toBe(false);
            expect(result.message.toLowerCase()).toContain("ssl certificate");
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    it("rejects invalid base URL protocols", async () => {
        const result = await accessService.testGitea("ftp://gitea.example.com", "token");
        expect(result.success).toBe(false);
        expect(result.message.toLowerCase()).toContain("invalid");
    });

    it("handles inactive or prohibited user accounts", async () => {
        const baseUrl = startMockGiteaServer();
        mockResponseBody = {
            id: 2,
            login: "blocked_user",
            active: false,
            prohibit_login: true,
        };

        const result = await accessService.testGitea(baseUrl, "token");
        expect(result.success).toBe(false);
        expect(result.message.toLowerCase()).toContain("prohibited");
    });

    it("tests multiple distinct Gitea instances independently", async () => {
        const serverA = Bun.serve({
            hostname: "127.0.0.1",
            port: 0,
            fetch() {
                return new Response(JSON.stringify({ login: "user_instance_a" }), {
                    status: 200,
                    headers: { "Content-Type": "application/json" },
                });
            },
        });

        const serverB = Bun.serve({
            hostname: "127.0.0.1",
            port: 0,
            fetch() {
                return new Response(JSON.stringify({ login: "user_instance_b" }), {
                    status: 200,
                    headers: { "Content-Type": "application/json" },
                });
            },
        });

        try {
            const urlA = `http://127.0.0.1:${serverA.port}`;
            const urlB = `http://127.0.0.1:${serverB.port}`;

            const resA = await accessService.testGitea(urlA, "token_a");
            const resB = await accessService.testGitea(urlB, "token_b");

            expect(resA.success).toBe(true);
            expect(resA.username).toBe("user_instance_a");
            expect(resB.success).toBe(true);
            expect(resB.username).toBe("user_instance_b");
        } finally {
            serverA.stop(true);
            serverB.stop(true);
        }
    });

    it("verifies testAccessCredentials controller endpoint for Gitea", async () => {
        const { Hono } = await import("hono");
        const { testAccessCredentials } = await import("./access.controller");

        const baseUrl = startMockGiteaServer();
        const app = new Hono();
        app.post("/test", testAccessCredentials);

        const response = await app.request("/test", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                provider: "gitea",
                baseUrl,
                accessToken: "controller_token_123",
            }),
        });

        expect(response.status).toBe(200);
        const data = (await response.json()) as { success: boolean; username?: string };
        expect(data.success).toBe(true);
        expect(data.username).toBe("alice_gitea");
    });

    it("verifies getAccessOverview controller endpoint for Gitea", async () => {
        const { Hono } = await import("hono");
        const { getAccessOverview } = await import("./access.controller");

        const baseUrl = startMockGiteaServer((req) => {
            const url = new URL(req.url);
            if (url.pathname === "/api/v1/user") {
                return new Response(JSON.stringify({ id: 10, login: "marcio", full_name: "Marcio J" }));
            }
            if (url.pathname === "/api/v1/user/orgs") {
                return new Response(JSON.stringify([{ id: 20, username: "acme", full_name: "ACME Corp" }]));
            }
            return new Response("Not found", { status: 404 });
        });

        const spyFindById = spyOn(GitLabAccessService.prototype, "findById").mockImplementation(async () => ({
            id: 1,
            provider: "gitea",
            name: "Test Gitea",
            baseUrl,
            autoCreateEnabled: false,
            defaultWebhookSecret: null,
            defaultWebhookSigningToken: null,
            createdAt: new Date(),
            updatedAt: new Date(),
        } as any));
        const spyGetToken = spyOn(GitLabAccessService.prototype, "getAccessToken").mockImplementation(async () => "mock_token");

        try {
            const app = new Hono();
            app.get("/:id/overview", getAccessOverview);

            const res = await app.request("/1/overview");
            expect(res.status).toBe(200);
            const body = (await res.json()) as any;
            expect(body.user.username).toBe("marcio");
            expect(body.organizationList.length).toBe(1);
            expect(body.organizationList[0].username).toBe("acme");
        } finally {
            spyFindById.mockRestore();
            spyGetToken.mockRestore();
        }
    });

    it("verifies getPagedRepositoryList controller endpoint for Gitea", async () => {
        const { Hono } = await import("hono");
        const { getPagedRepositoryList } = await import("./access.controller");

        const baseUrl = startMockGiteaServer((req) => {
            const url = new URL(req.url);
            if (url.pathname === "/api/v1/user/repos") {
                return new Response(
                    JSON.stringify([
                        {
                            id: 100,
                            name: "my_repo",
                            full_name: "marcio/my_repo",
                            owner: { login: "marcio" },
                            private: true,
                            default_branch: "main",
                        },
                    ]),
                    { headers: { "x-total-count": "1" } },
                );
            }
            return new Response("Not found", { status: 404 });
        });

        const spyFindById = spyOn(GitLabAccessService.prototype, "findById").mockImplementation(async () => ({
            id: 1,
            provider: "gitea",
            name: "Test Gitea",
            baseUrl,
            autoCreateEnabled: false,
            defaultWebhookSecret: null,
            defaultWebhookSigningToken: null,
            createdAt: new Date(),
            updatedAt: new Date(),
        } as any));
        const spyGetToken = spyOn(GitLabAccessService.prototype, "getAccessToken").mockImplementation(async () => "mock_token");
        const spyConnected = spyOn(GitLabAccessService.prototype, "getConnectedGitProviderRepositoryIds").mockImplementation(
            async () => new Set([100]),
        );

        try {
            const app = new Hono();
            app.get("/:id/repository-paged", getPagedRepositoryList);

            const res = await app.request("/1/repository-paged?page=1&limit=10");
            expect(res.status).toBe(200);
            const body = (await res.json()) as any;
            expect(body.repositoryList.length).toBe(1);
            expect(body.repositoryList[0].name).toBe("my_repo");
            expect(body.repositoryList[0].alreadyConnected).toBe(true);
            expect(body.total).toBe(1);
        } finally {
            spyFindById.mockRestore();
            spyGetToken.mockRestore();
            spyConnected.mockRestore();
        }
    });

    it("verifies getPagedPullRequestList controller endpoint for Gitea", async () => {
        const { Hono } = await import("hono");
        const { getPagedPullRequestList } = await import("./access.controller");

        const baseUrl = startMockGiteaServer((req) => {
            const url = new URL(req.url);
            if (url.pathname.includes("/pulls")) {
                return new Response(
                    JSON.stringify([
                        {
                            id: 1,
                            number: 42,
                            title: "Update config",
                            user: { login: "alice" },
                            head: { ref: "feature" },
                            base: { ref: "main" },
                            state: "open",
                            merged: false,
                            created_at: "2026-11-01T00:00:00Z",
                            updated_at: "2026-11-02T00:00:00Z",
                        },
                    ]),
                    { headers: { "x-total-count": "1" } },
                );
            }
            return new Response("Not found", { status: 404 });
        });

        const spyFindById = spyOn(GitLabAccessService.prototype, "findById").mockImplementation(async () => ({
            id: 1,
            provider: "gitea",
            name: "Test Gitea",
            baseUrl,
            autoCreateEnabled: false,
            defaultWebhookSecret: null,
            defaultWebhookSigningToken: null,
            createdAt: new Date(),
            updatedAt: new Date(),
        } as any));
        const spyGetToken = spyOn(GitLabAccessService.prototype, "getAccessToken").mockImplementation(async () => "mock_token");

        try {
            const app = new Hono();
            app.get("/:id/pull-request", getPagedPullRequestList);

            const res = await app.request("/1/pull-request?owner=marcio&repo=my_repo&state=open");
            expect(res.status).toBe(200);
            const body = (await res.json()) as any;
            expect(body.pullRequestList.length).toBe(1);
            expect(body.pullRequestList[0].number).toBe(42);
            expect(body.pullRequestList[0].author).toBe("alice");
            expect(body.pullRequestList[0].state).toBe("open");
        } finally {
            spyFindById.mockRestore();
            spyGetToken.mockRestore();
        }
    });
});
