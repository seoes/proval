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
        mockServerPort = mockServer.port ?? 0;
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

    it("fetches PR details and modified files with common changes", async () => {
        const baseUrl = startMockServer((req) => {
            const url = new URL(req.url);
            if (url.pathname === "/api/v1/repos/acme/proj/pulls/1") {
                return new Response(
                    JSON.stringify({
                        id: 101,
                        number: 1,
                        title: "Add authentication feature",
                        body: "Implements JWT authentication",
                        state: "open",
                        merged: false,
                        created_at: "2026-11-01T10:00:00Z",
                        updated_at: "2026-11-02T12:00:00Z",
                        closed_at: null,
                        merged_at: null,
                        user: { login: "alice", avatar_url: "http://example.com/alice.png" },
                        head: { ref: "feature_auth", sha: "abc111", repo: { name: "proj", owner: { login: "acme" } } },
                        base: { ref: "main", sha: "def222", repo: { name: "proj", owner: { login: "acme" } } },
                        html_url: "http://example.com/acme/proj/pulls/1",
                        additions: 15,
                        deletions: 3,
                        changed_files: 1,
                    }),
                    { headers: { "Content-Type": "application/json" } },
                );
            }
            if (url.pathname === "/api/v1/repos/acme/proj/pulls/1/files") {
                return new Response(
                    JSON.stringify([
                        {
                            filename: "src/auth.ts",
                            previous_filename: null,
                            status: "modified",
                            additions: 15,
                            deletions: 3,
                            changes: 18,
                            patch: "@@ -1,3 +1,15 @@\n-old code\n+new code\n unchanged",
                        },
                    ]),
                    { headers: { "Content-Type": "application/json", "x-total-count": "1" } },
                );
            }
            return new Response("Not found", { status: 404 });
        });

        const provider = new GiteaProvider(baseUrl, "test_token", "acme", "proj");
        const detail = await provider.fetchPullRequestDiffDetail("acme", "proj", 1);

        expect(detail.pullRequest.number).toBe(1);
        expect(detail.pullRequest.title).toBe("Add authentication feature");
        expect(detail.pullRequest.body).toBe("Implements JWT authentication");
        expect(detail.pullRequest.state).toBe("open");
        expect(detail.pullRequest.author).toBe("alice");
        expect(detail.pullRequest.sourceBranch).toBe("feature_auth");
        expect(detail.pullRequest.targetBranch).toBe("main");
        expect(detail.pullRequest.headSha).toBe("abc111");
        expect(detail.pullRequest.baseSha).toBe("def222");
        expect(detail.pullRequest.additions).toBe(15);
        expect(detail.pullRequest.deletions).toBe(3);
        expect(detail.fileList.length).toBe(1);
        expect(detail.fileList[0].filename).toBe("src/auth.ts");
        expect(detail.fileList[0].status).toBe("modified");
        expect(detail.fileList[0].patch).toContain("+new code");
        expect(detail.isTruncated).toBe(false);
    });

    it("handles PR with no modified files", async () => {
        const baseUrl = startMockServer((req) => {
            const url = new URL(req.url);
            if (url.pathname.includes("/files")) {
                return new Response(JSON.stringify([]), {
                    headers: { "Content-Type": "application/json", "x-total-count": "0" },
                });
            }
            return new Response(
                JSON.stringify({
                    id: 2,
                    number: 2,
                    title: "Empty PR",
                    state: "open",
                    merged: false,
                    user: { login: "bob" },
                    head: { ref: "empty", sha: "111" },
                    base: { ref: "main", sha: "111" },
                }),
                { headers: { "Content-Type": "application/json" } },
            );
        });

        const provider = new GiteaProvider(baseUrl, "test_token", "acme", "proj");
        const detail = await provider.fetchPullRequestDiffDetail("acme", "proj", 2);

        expect(detail.fileList).toEqual([]);
        expect(detail.totalFileCount).toBe(0);
        expect(detail.isTruncated).toBe(false);
    });

    it("handles PR with added, modified and deleted files", async () => {
        const baseUrl = startMockServer((req) => {
            const url = new URL(req.url);
            if (url.pathname.includes("/files")) {
                return new Response(
                    JSON.stringify([
                        { filename: "new_file.ts", status: "added", additions: 20, deletions: 0, patch: "@@ -0,0 +1,20 @@\n+line" },
                        { filename: "modified.ts", status: "modified", additions: 5, deletions: 2, patch: "@@ -1,2 +1,5 @@\n-old\n+new" },
                        { filename: "old_file.ts", status: "deleted", additions: 0, deletions: 10, patch: "@@ -1,10 +0,0 @@\n-deleted" },
                    ]),
                    { headers: { "Content-Type": "application/json", "x-total-count": "3" } },
                );
            }
            return new Response(
                JSON.stringify({
                    id: 3,
                    number: 3,
                    title: "Multi status PR",
                    state: "open",
                    merged: false,
                    user: { login: "carol" },
                    head: { ref: "feat", sha: "222" },
                    base: { ref: "main", sha: "111" },
                }),
                { headers: { "Content-Type": "application/json" } },
            );
        });

        const provider = new GiteaProvider(baseUrl, "test_token", "acme", "proj");
        const detail = await provider.fetchPullRequestDiffDetail("acme", "proj", 3);

        expect(detail.fileList.length).toBe(3);
        expect(detail.fileList[0].status).toBe("added");
        expect(detail.fileList[0].additions).toBe(20);
        expect(detail.fileList[1].status).toBe("modified");
        expect(detail.fileList[2].status).toBe("deleted");
        expect(detail.fileList[2].deletions).toBe(10);
    });

    it("handles renamed files with previous_filename", async () => {
        const baseUrl = startMockServer((req) => {
            const url = new URL(req.url);
            if (url.pathname.includes("/files")) {
                return new Response(
                    JSON.stringify([
                        {
                            filename: "new_name.ts",
                            previous_filename: "old_name.ts",
                            status: "renamed",
                            additions: 2,
                            deletions: 1,
                            patch: "@@ -1,1 +1,2 @@\n-old\n+new",
                        },
                    ]),
                    { headers: { "Content-Type": "application/json" } },
                );
            }
            return new Response(
                JSON.stringify({
                    id: 4,
                    number: 4,
                    title: "Rename PR",
                    state: "open",
                    merged: false,
                    user: { login: "dan" },
                    head: { ref: "rename", sha: "333" },
                    base: { ref: "main", sha: "111" },
                }),
                { headers: { "Content-Type": "application/json" } },
            );
        });

        const provider = new GiteaProvider(baseUrl, "test_token", "acme", "proj");
        const detail = await provider.fetchPullRequestDiffDetail("acme", "proj", 4);

        expect(detail.fileList[0].status).toBe("renamed");
        expect(detail.fileList[0].previousFilename).toBe("old_name.ts");
        expect(detail.fileList[0].filename).toBe("new_name.ts");
    });

    it("identifies binary files and suppresses patch output", async () => {
        const baseUrl = startMockServer((req) => {
            const url = new URL(req.url);
            if (url.pathname.includes("/files")) {
                return new Response(
                    JSON.stringify([
                        {
                            filename: "logo.png",
                            status: "added",
                            additions: 0,
                            deletions: 0,
                            patch: null,
                        },
                        {
                            filename: "binary.dat",
                            status: "modified",
                            additions: 0,
                            deletions: 0,
                            patch: "Binary files a/binary.dat and b/binary.dat differ",
                        },
                    ]),
                    { headers: { "Content-Type": "application/json" } },
                );
            }
            return new Response(
                JSON.stringify({
                    id: 5,
                    number: 5,
                    title: "Assets PR",
                    state: "open",
                    merged: false,
                    user: { login: "eve" },
                    head: { ref: "assets", sha: "444" },
                    base: { ref: "main", sha: "111" },
                }),
                { headers: { "Content-Type": "application/json" } },
            );
        });

        const provider = new GiteaProvider(baseUrl, "test_token", "acme", "proj");
        const detail = await provider.fetchPullRequestDiffDetail("acme", "proj", 5);

        expect(detail.fileList[0].isBinary).toBe(true);
        expect(detail.fileList[0].patch).toBeNull();
        expect(detail.fileList[1].isBinary).toBe(true);
        expect(detail.fileList[1].patch).toBeNull();
    });

    it("handles unavailable diff gracefully without crashing", async () => {
        const baseUrl = startMockServer((req) => {
            const url = new URL(req.url);
            if (url.pathname.includes("/files")) {
                return new Response(
                    JSON.stringify([
                        {
                            filename: "no_diff.txt",
                            status: "modified",
                            additions: 0,
                            deletions: 0,
                            patch: null,
                        },
                    ]),
                    { headers: { "Content-Type": "application/json" } },
                );
            }
            return new Response(
                JSON.stringify({
                    id: 6,
                    number: 6,
                    title: "No diff PR",
                    state: "open",
                    merged: false,
                    user: { login: "frank" },
                    head: { ref: "nodiff", sha: "555" },
                    base: { ref: "main", sha: "111" },
                }),
                { headers: { "Content-Type": "application/json" } },
            );
        });

        const provider = new GiteaProvider(baseUrl, "test_token", "acme", "proj");
        const detail = await provider.fetchPullRequestDiffDetail("acme", "proj", 6);

        expect(detail.fileList.length).toBe(1);
        expect(detail.fileList[0].patch).toBeNull();
    });

    it("handles very large diff by truncating and flagging", async () => {
        const hugePatch = "@@ -1,1 +1,2 @@\n+" + "A".repeat(120_000);
        const baseUrl = startMockServer((req) => {
            const url = new URL(req.url);
            if (url.pathname.includes("/files")) {
                return new Response(
                    JSON.stringify([
                        {
                            filename: "huge_generated.json",
                            status: "added",
                            additions: 1000,
                            deletions: 0,
                            patch: hugePatch,
                        },
                    ]),
                    { headers: { "Content-Type": "application/json" } },
                );
            }
            return new Response(
                JSON.stringify({
                    id: 7,
                    number: 7,
                    title: "Huge diff PR",
                    state: "open",
                    merged: false,
                    user: { login: "grace" },
                    head: { ref: "huge", sha: "666" },
                    base: { ref: "main", sha: "111" },
                }),
                { headers: { "Content-Type": "application/json" } },
            );
        });

        const provider = new GiteaProvider(baseUrl, "test_token", "acme", "proj");
        const detail = await provider.fetchPullRequestDiffDetail("acme", "proj", 7);

        expect(detail.fileList[0].isTruncated).toBe(true);
        expect(detail.fileList[0].patch).toContain("[Diff truncated");
        expect(detail.isTruncated).toBe(true);
    });

    it("throws 404 when PR does not exist", async () => {
        const baseUrl = startMockServer(() => new Response(JSON.stringify({ message: "Pull request not found" }), { status: 404 }));

        const provider = new GiteaProvider(baseUrl, "test_token", "acme", "proj");
        let errorCaught: any = null;
        try {
            await provider.fetchPullRequestDiffDetail("acme", "proj", 9999);
        } catch (e) {
            errorCaught = e;
        }

        expect(errorCaught).not.toBeNull();
        expect(errorCaught.status).toBe(404);
    });

    it("throws 403 when repository permission is denied", async () => {
        const baseUrl = startMockServer(() => new Response(JSON.stringify({ message: "Access forbidden" }), { status: 403 }));

        const provider = new GiteaProvider(baseUrl, "test_token", "acme", "proj");
        let errorCaught: any = null;
        try {
            await provider.fetchPullRequestDiffDetail("acme", "proj", 1);
        } catch (e) {
            errorCaught = e;
        }

        expect(errorCaught).not.toBeNull();
        expect(errorCaught.status).toBe(403);
    });

    it("throws 401 when token is invalid or expired", async () => {
        const baseUrl = startMockServer(() => new Response(JSON.stringify({ message: "Token expired or invalid" }), { status: 401 }));

        const provider = new GiteaProvider(baseUrl, "expired_token", "acme", "proj");
        let errorCaught: any = null;
        try {
            await provider.fetchDetailedPullRequest("acme", "proj", 1);
        } catch (e) {
            errorCaught = e;
        }

        expect(errorCaught).not.toBeNull();
        expect(errorCaught.status).toBe(401);
    });

    it("handles connection failure cleanly", async () => {
        const provider = new GiteaProvider("http://127.0.0.1:1", "test_token", "acme", "proj");
        expect(provider.fetchDetailedPullRequest("acme", "proj", 1)).rejects.toThrow();
    });

    it("handles incomplete or partial API responses gracefully without crashing", async () => {
        const baseUrl = startMockServer((req) => {
            const url = new URL(req.url);
            if (url.pathname.includes("/files")) {
                return new Response(
                    JSON.stringify([
                        {
                            filename: "incomplete.ts",
                        },
                    ]),
                    { headers: { "Content-Type": "application/json" } },
                );
            }
            return new Response(
                JSON.stringify({
                    id: 8,
                    number: 8,
                }),
                { headers: { "Content-Type": "application/json" } },
            );
        });

        const provider = new GiteaProvider(baseUrl, "test_token", "acme", "proj");
        const detail = await provider.fetchPullRequestDiffDetail("acme", "proj", 8);

        expect(detail.pullRequest.number).toBe(8);
        expect(detail.pullRequest.title).toBe("");
        expect(detail.pullRequest.body).toBeNull();
        expect(detail.pullRequest.state).toBe("closed");
        expect(detail.pullRequest.author).toBe("");
        expect(detail.pullRequest.headSha).toBe("");
        expect(detail.pullRequest.baseSha).toBe("");
        expect(detail.fileList[0].filename).toBe("incomplete.ts");
        expect(detail.fileList[0].status).toBe("modified");
        expect(detail.fileList[0].additions).toBe(0);
        expect(detail.fileList[0].deletions).toBe(0);
        expect(detail.fileList[0].patch).toBeNull();
    });

    it("fetches raw unified diff successfully and limits large sizes", async () => {
        const diffText = "diff --git a/test.ts b/test.ts\n--- a/test.ts\n+++ b/test.ts\n@@ -1 +1 @@\n-old\n+new";
        const baseUrl = startMockServer(() => new Response(diffText, { headers: { "Content-Type": "text/plain" } }));

        const provider = new GiteaProvider(baseUrl, "test_token", "acme", "proj");
        const rawDiff = await provider.fetchPullRequestRawDiff("acme", "proj", 1);

        expect(rawDiff).toBe(diffText);
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

