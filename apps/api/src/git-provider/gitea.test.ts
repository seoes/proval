import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { GiteaProvider } from "./gitea";

describe("GiteaProvider", () => {
    let mockServer: ReturnType<typeof Bun.serve> | null = null;
    let mockServerPort = 0;
    let lastRequestUrl = "";
    let lastAuthHeader = "";
    let mockStatus = 200;
    let mockResponseBody: unknown = {};
    let mockHeaders: Record<string, string> = {};

    beforeEach(() => {
        mockStatus = 200;
        mockResponseBody = {};
        mockHeaders = { "Content-Type": "application/json" };
        lastRequestUrl = "";
        lastAuthHeader = "";
    });

    afterEach(() => {
        if (mockServer) {
            mockServer.stop(true);
            mockServer = null;
        }
    });

    function startMockServer(customHandler?: (req: Request) => Promise<Response> | Response) {
        mockServer = Bun.serve({
            hostname: "127.0.0.1",
            port: 0,
            async fetch(req) {
                lastRequestUrl = req.url;
                lastAuthHeader = req.headers.get("authorization") || "";

                if (customHandler) {
                    return customHandler(req);
                }

                return new Response(JSON.stringify(mockResponseBody), {
                    status: mockStatus,
                    headers: mockHeaders,
                });
            },
        });
        mockServerPort = mockServer.port;
        return `http://127.0.0.1:${mockServerPort}`;
    }

    it("fetches authenticated user details", async () => {
        const baseUrl = startMockServer();
        mockResponseBody = {
            id: 42,
            login: "developer_one",
            full_name: "Developer One",
            email: "dev@example.com",
            avatar_url: "http://example.com/avatar.png",
        };

        const provider = new GiteaProvider(baseUrl, "test_token", "developer_one", "my_repo");
        const user = await provider.fetchUserDetail();

        expect(user.id).toBe(42);
        expect(user.username).toBe("developer_one");
        expect(user.fullName).toBe("Developer One");
        expect(lastRequestUrl).toContain("/api/v1/user");
        expect(lastAuthHeader).toBe("token test_token");
    });

    it("fetches list of organizations for authenticated user", async () => {
        const baseUrl = startMockServer();
        mockResponseBody = [
            {
                id: 10,
                username: "acme_corp",
                full_name: "ACME Corporation",
                description: "Company Organization",
                avatar_url: "http://example.com/acme.png",
            },
            {
                id: 11,
                username: "open_source_group",
                full_name: "Open Source Group",
                description: null,
                avatar_url: null,
            },
        ];

        const provider = new GiteaProvider(baseUrl, "test_token", "developer_one", "my_repo");
        const orgList = await provider.fetchOrganizationList({ page: 1, limit: 10 });

        expect(orgList.length).toBe(2);
        expect(orgList[0].username).toBe("acme_corp");
        expect(orgList[0].fullName).toBe("ACME Corporation");
        expect(orgList[1].username).toBe("open_source_group");
        expect(lastRequestUrl).toContain("/api/v1/user/orgs");
        expect(lastRequestUrl).toContain("page=1");
        expect(lastRequestUrl).toContain("limit=10");
    });

    it("fetches personal repositories with pagination and total count", async () => {
        const baseUrl = startMockServer();
        mockHeaders["x-total-count"] = "25";
        mockResponseBody = [
            {
                id: 101,
                name: "personal_library",
                full_name: "developer_one/personal_library",
                owner: { login: "developer_one" },
                description: "A private utility library",
                private: true,
                html_url: "http://example.com/developer_one/personal_library",
                default_branch: "main",
                permissions: { admin: true, push: true, pull: true },
            },
        ];

        const provider = new GiteaProvider(baseUrl, "test_token", "developer_one", "my_repo");
        const result = await provider.fetchPagedRepositoryList({ org: "personal", page: 2, limit: 1 });

        expect(result.repositoryList.length).toBe(1);
        expect(result.repositoryList[0].name).toBe("personal_library");
        expect(result.repositoryList[0].isPrivate).toBe(true);
        expect(result.repositoryList[0].owner).toBe("developer_one");
        expect(result.total).toBe(25);
        expect(result.page).toBe(2);
        expect(result.limit).toBe(1);
        expect(lastRequestUrl).toContain("/api/v1/user/repos");
    });

    it("fetches organization repositories when org is specified", async () => {
        const baseUrl = startMockServer();
        mockHeaders["x-total-count"] = "8";
        mockResponseBody = [
            {
                id: 201,
                name: "core_service",
                full_name: "acme_corp/core_service",
                owner: { login: "acme_corp" },
                description: "Core backend service",
                private: false,
                html_url: "http://example.com/acme_corp/core_service",
                default_branch: "develop",
                permissions: { admin: false, push: true, pull: true },
            },
        ];

        const provider = new GiteaProvider(baseUrl, "test_token", "developer_one", "my_repo");
        const result = await provider.fetchPagedRepositoryList({ org: "acme_corp", page: 1, limit: 10 });

        expect(result.repositoryList.length).toBe(1);
        expect(result.repositoryList[0].name).toBe("core_service");
        expect(result.repositoryList[0].isPrivate).toBe(false);
        expect(result.repositoryList[0].defaultBranch).toBe("develop");
        expect(lastRequestUrl).toContain("/api/v1/orgs/acme_corp/repos");
    });

    it("fetches open pull requests with branches, author and timestamps", async () => {
        const baseUrl = startMockServer();
        mockHeaders["x-total-count"] = "3";
        mockResponseBody = [
            {
                id: 501,
                number: 12,
                title: "Add caching layer",
                body: "Implements Redis caching",
                state: "open",
                merged: false,
                user: { login: "alice_dev" },
                head: { ref: "feature_cache" },
                base: { ref: "main" },
                created_at: "2026-11-01T10:00:00Z",
                updated_at: "2026-11-09T12:00:00Z",
                html_url: "http://example.com/acme_corp/core_service/pulls/12",
            },
        ];

        const provider = new GiteaProvider(baseUrl, "test_token", "acme_corp", "core_service");
        const result = await provider.fetchPagedPullRequestList("acme_corp", "core_service", {
            state: "open",
            page: 1,
            limit: 10,
        });

        expect(result.pullRequestList.length).toBe(1);
        const pr = result.pullRequestList[0];
        expect(pr.number).toBe(12);
        expect(pr.title).toBe("Add caching layer");
        expect(pr.author).toBe("alice_dev");
        expect(pr.sourceBranch).toBe("feature_cache");
        expect(pr.targetBranch).toBe("main");
        expect(pr.state).toBe("open");
        expect(lastRequestUrl).toContain("/api/v1/repos/acme_corp/core_service/pulls");
        expect(lastRequestUrl).toContain("state=open");
    });

    it("fetches closed and merged pull requests correctly", async () => {
        const baseUrl = startMockServer();
        mockResponseBody = [
            {
                id: 502,
                number: 10,
                title: "Bugfix session timeout",
                body: null,
                state: "closed",
                merged: true,
                merged_at: "2026-11-05T09:00:00Z",
                user: { login: "bob_dev" },
                head: { ref: "fix_session" },
                base: { ref: "main" },
                created_at: "2026-11-04T10:00:00Z",
                updated_at: "2026-11-05T09:00:00Z",
                html_url: "http://example.com/acme_corp/core_service/pulls/10",
            },
            {
                id: 503,
                number: 11,
                title: "Abandoned test",
                body: null,
                state: "closed",
                merged: false,
                merged_at: null,
                user: { login: "charlie_dev" },
                head: { ref: "test_abandon" },
                base: { ref: "main" },
                created_at: "2026-11-06T10:00:00Z",
                updated_at: "2026-11-07T09:00:00Z",
                html_url: "http://example.com/acme_corp/core_service/pulls/11",
            },
        ];

        const provider = new GiteaProvider(baseUrl, "test_token", "acme_corp", "core_service");
        const mergedResult = await provider.fetchPagedPullRequestList("acme_corp", "core_service", {
            state: "merged",
        });

        expect(mergedResult.pullRequestList.length).toBe(1);
        expect(mergedResult.pullRequestList[0].number).toBe(10);
        expect(mergedResult.pullRequestList[0].state).toBe("merged");
    });

    it("returns empty list when repository has no pull requests", async () => {
        const baseUrl = startMockServer();
        mockResponseBody = [];
        mockHeaders["x-total-count"] = "0";

        const provider = new GiteaProvider(baseUrl, "test_token", "acme_corp", "empty_repo");
        const result = await provider.fetchPagedPullRequestList("acme_corp", "empty_repo", { state: "all" });

        expect(result.pullRequestList).toEqual([]);
        expect(result.total).toBe(0);
    });

    it("throws appropriate error on unauthorized token 401", async () => {
        const baseUrl = startMockServer();
        mockStatus = 401;
        mockResponseBody = { message: "token is not valid" };

        const provider = new GiteaProvider(baseUrl, "bad_token", "owner", "repo");
        expect(provider.fetchOrganizationList()).rejects.toThrow();
    });

    it("handles multiple independent Gitea connections cleanly", async () => {
        const serverA = Bun.serve({
            hostname: "127.0.0.1",
            port: 0,
            fetch() {
                return new Response(JSON.stringify({ id: 1, login: "instance_a_user" }), {
                    headers: { "Content-Type": "application/json" },
                });
            },
        });

        const serverB = Bun.serve({
            hostname: "127.0.0.1",
            port: 0,
            fetch() {
                return new Response(JSON.stringify({ id: 2, login: "instance_b_user" }), {
                    headers: { "Content-Type": "application/json" },
                });
            },
        });

        try {
            const providerA = new GiteaProvider(`http://127.0.0.1:${serverA.port}`, "token_a", "owner", "repo");
            const providerB = new GiteaProvider(`http://127.0.0.1:${serverB.port}`, "token_b", "owner", "repo");

            const userA = await providerA.fetchUserDetail();
            const userB = await providerB.fetchUserDetail();

            expect(userA.username).toBe("instance_a_user");
            expect(userB.username).toBe("instance_b_user");
        } finally {
            serverA.stop(true);
            serverB.stop(true);
        }
    });
});

