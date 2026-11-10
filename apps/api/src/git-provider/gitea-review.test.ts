import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { GiteaProvider } from "./gitea";
import type { GitDiff, GitDiffSingleLine, GitDiffMultiLine } from "./types";
import { createSingleLineCommentTool } from "../agent/pull-request/tool/create-single-line-comment.js";
import { postPullRequestCommentTool } from "../agent/pull-request/tool/post-pull-request-comment.js";
import { evaluatePullRequestTool } from "../agent/pull-request/tool/evaluate-pull-request.js";
import { CommentService } from "../api/comment/comment.service.js";
import type { Workspace } from "./workspace.js";

describe("Gitea Code Review Execution & Publication", () => {
    let mockServer: ReturnType<typeof Bun.serve> | null = null;
    let mockServerPort = 0;
    let receivedRequestList: Array<{ method: string; url: string; body: unknown; headers: Record<string, string> }> = [];

    beforeEach(() => {
        receivedRequestList = [];
    });

    afterEach(() => {
        if (mockServer) {
            mockServer.stop(true);
            mockServer = null;
        }
    });

    function startMockServer(customRouter?: (req: Request, url: URL) => Promise<Response | null> | Response | null) {
        mockServer = Bun.serve({
            hostname: "127.0.0.1",
            port: 0,
            async fetch(req) {
                const url = new URL(req.url);
                let body: unknown = null;
                const contentType = req.headers.get("content-type") || "";
                if (contentType.includes("application/json")) {
                    try {
                        body = await req.json();
                    } catch {
                        body = null;
                    }
                } else {
                    body = await req.text();
                }

                const headers: Record<string, string> = {};
                req.headers.forEach((value, key) => {
                    headers[key] = value;
                });

                receivedRequestList.push({
                    method: req.method,
                    url: url.pathname + url.search,
                    body,
                    headers,
                });

                if (customRouter) {
                    const customResponse = await customRouter(req, url);
                    if (customResponse) {
                        return customResponse;
                    }
                }

                // Default routes
                if (url.pathname.endsWith("/version") || url.pathname.match(/\/pulls\/\d+$/)) {
                    return new Response(
                        JSON.stringify({
                            title: "Add awesome feature",
                            body: "PR description",
                            state: "open",
                            merged: false,
                            head: { ref: "feature-branch", sha: "abc123headsha" },
                            base: { ref: "main", sha: "base456sha" },
                            merge_base: "start789sha",
                            user: { login: "developer" },
                        }),
                        { status: 200, headers: { "Content-Type": "application/json" } },
                    );
                }

                if (url.pathname.endsWith("/reviews") && req.method === "POST") {
                    return new Response(
                        JSON.stringify({
                            id: 501,
                            body: (body as Record<string, unknown>)?.body ?? "",
                            state: (body as Record<string, unknown>)?.event ?? "COMMENT",
                            commit_id: (body as Record<string, unknown>)?.commit_id ?? "abc123headsha",
                            submitted_at: "2026-11-09T17:00:00Z",
                            user: { login: "proval-bot" },
                        }),
                        { status: 201, headers: { "Content-Type": "application/json" } },
                    );
                }

                if (url.pathname.includes("/reviews/501/comments") && req.method === "GET") {
                    const commentsDraft = ((receivedRequestList.find((r) => r.method === "POST" && r.url.endsWith("/reviews"))?.body as Record<string, unknown>)?.comments as Array<{ path: string; body: string }>) || [];
                    const publishedList = commentsDraft.map((c, idx) => ({
                        id: 1000 + idx + 1,
                        body: c.body,
                        path: c.path,
                        user: { login: "proval-bot" },
                        created_at: "2026-11-09T17:00:00Z",
                    }));
                    return new Response(JSON.stringify(publishedList), {
                        status: 200,
                        headers: { "Content-Type": "application/json" },
                    });
                }

                if (url.pathname.endsWith("/comments") && req.method === "POST") {
                    return new Response(
                        JSON.stringify({
                            id: 701,
                            body: (body as Record<string, unknown>)?.body ?? "",
                            user: { login: "proval-bot" },
                            created_at: "2026-11-09T17:00:00Z",
                        }),
                        { status: 201, headers: { "Content-Type": "application/json" } },
                    );
                }

                if (url.pathname.endsWith("/reactions") && req.method === "POST") {
                    return new Response(JSON.stringify({ content: "+1" }), {
                        status: 201,
                        headers: { "Content-Type": "application/json" },
                    });
                }

                return new Response(JSON.stringify({}), {
                    status: 200,
                    headers: { "Content-Type": "application/json" },
                });
            },
        });
        mockServerPort = mockServer.port;
        return `http://127.0.0.1:${mockServerPort}`;
    }

    it("publishes native PR review with summary body and individual inline comments", async () => {
        const baseUrl = startMockServer();
        const provider = new GiteaProvider(baseUrl, "test_token", "acme", "project", 42);

        // 1. Buffer single-line comment on added line
        const singleLinePos: GitDiffSingleLine = {
            baseSha: "base456sha",
            headSha: "abc123headsha",
            startSha: "start789sha",
            oldPath: "src/calculator.ts",
            newPath: "src/calculator.ts",
            newLine: 42,
            oldLine: undefined,
        };
        const singleComment = await provider.createCommentToSingleLine(
            1,
            "🚨 [CRITICAL] Potential division by zero\nEnsure denominator is checked before dividing.",
            singleLinePos,
        );
        expect(singleComment.id).toBeLessThan(0); // Temporary buffered ID

        // 2. Buffer multi-line comment spanning lines 50-55
        const multiLinePos: GitDiffMultiLine = {
            baseSha: "base456sha",
            headSha: "abc123headsha",
            startSha: "start789sha",
            oldPath: "src/utils.ts",
            newPath: "src/utils.ts",
            start: { type: "new", newLine: 50 },
            end: { type: "new", newLine: 55 },
        };
        const multiComment = await provider.createCommentToMultiLine(
            1,
            "⚫️ [PROBLEM] Resource leak in stream reader\nStream should be closed in finally block.",
            multiLinePos,
        );
        expect(multiComment.id).toBeLessThan(0);

        // 3. Publish the review with general summary
        const summaryBody = "## Code Review Summary\n\nOverall the PR looks good with 2 issues identified.\n- 1 critical issue\n- 1 problem";
        const publishedReview = await provider.createPullRequestComment(1, summaryBody);

        expect(publishedReview.id).toBe(501);
        expect(publishedReview.body).toBe(summaryBody);
        expect(publishedReview.author).toBe("proval-bot");

        // 4. Verify takeFlushedInlineCommentList returns both published inline comments
        const flushedList = provider.takeFlushedInlineCommentList();
        expect(flushedList.length).toBe(2);
        expect(flushedList[0].id).toBe(1001);
        expect(flushedList[1].id).toBe(1002);
        expect(provider.takeFlushedInlineCommentList().length).toBe(0); // Buffer reset

        // 5. Verify the HTTP request sent to Gitea
        const reviewReq = receivedRequestList.find((r) => r.method === "POST" && r.url === "/api/v1/repos/acme/project/pulls/1/reviews");
        expect(reviewReq).toBeDefined();
        expect(reviewReq?.headers.authorization).toBe("token test_token");

        const reviewPayload = reviewReq?.body as Record<string, unknown>;
        expect(reviewPayload.event).toBe("COMMENT");
        expect(reviewPayload.body).toBe(summaryBody);
        expect(reviewPayload.commit_id).toBe("abc123headsha");

        const comments = reviewPayload.comments as Array<{ path: string; body: string; new_position: number; old_position: number }>;
        expect(comments.length).toBe(2);

        // First comment verification
        expect(comments[0].path).toBe("src/calculator.ts");
        expect(comments[0].new_position).toBe(42);
        expect(comments[0].old_position).toBe(0);
        expect(comments[0].body).toContain("Potential division by zero");

        // Second comment verification (multi-line)
        expect(comments[1].path).toBe("src/utils.ts");
        expect(comments[1].new_position).toBe(55);
        expect(comments[1].old_position).toBe(0);
        expect(comments[1].body).toContain("*(lines 50-55)*");
        expect(comments[1].body).toContain("Resource leak in stream reader");
    });

    it("publishes inline comments on deleted lines pointing to oldPath and old_position", async () => {
        const baseUrl = startMockServer();
        const provider = new GiteaProvider(baseUrl, "test_token", "acme", "project", 42);

        const deletePos: GitDiffSingleLine = {
            baseSha: "base456sha",
            headSha: "abc123headsha",
            startSha: "start789sha",
            oldPath: "src/deprecated.ts",
            newPath: "src/deprecated.ts",
            newLine: undefined,
            oldLine: 25,
        };
        await provider.createCommentToSingleLine(1, "⚫️ [PROBLEM] Removing this function breaks public API", deletePos);

        await provider.createPullRequestComment(1, "Review on deleted code");

        const reviewReq = receivedRequestList.find((r) => r.method === "POST" && r.url === "/api/v1/repos/acme/project/pulls/1/reviews");
        const reviewPayload = reviewReq?.body as Record<string, unknown>;
        const comments = reviewPayload.comments as Array<{ path: string; old_position: number; new_position: number }>;

        expect(comments.length).toBe(1);
        expect(comments[0].path).toBe("src/deprecated.ts");
        expect(comments[0].old_position).toBe(25);
        expect(comments[0].new_position).toBe(0);
    });

    it("publishes native review when there are no inline comments (clean PR)", async () => {
        const baseUrl = startMockServer();
        const provider = new GiteaProvider(baseUrl, "test_token", "acme", "project", 42);

        const cleanSummary = "## Code Review\n\n🟢 All good! Clean implementation with high test coverage.";
        const result = await provider.createPullRequestComment(1, cleanSummary);

        expect(result.id).toBe(501);
        expect(result.body).toBe(cleanSummary);

        const reviewReq = receivedRequestList.find((r) => r.method === "POST" && r.url === "/api/v1/repos/acme/project/pulls/1/reviews");
        expect(reviewReq).toBeDefined();

        const reviewPayload = reviewReq?.body as Record<string, unknown>;
        expect(reviewPayload.event).toBe("COMMENT");
        expect(reviewPayload.body).toBe(cleanSummary);
        expect((reviewPayload.comments as unknown[]).length).toBe(0);
    });

    it("falls back to issue comment when Gitea reviews API fails", async () => {
        const baseUrl = startMockServer((req, url) => {
            if (url.pathname.endsWith("/reviews") && req.method === "POST") {
                return new Response(JSON.stringify({ message: "Invalid diff position" }), {
                    status: 422,
                    headers: { "Content-Type": "application/json" },
                });
            }
            return null;
        });

        const provider = new GiteaProvider(baseUrl, "test_token", "acme", "project", 42);

        const pos: GitDiffSingleLine = {
            baseSha: "base456sha",
            headSha: "abc123headsha",
            startSha: "start789sha",
            oldPath: "src/main.ts",
            newPath: "src/main.ts",
            newLine: 9999, // faulty line
        };
        await provider.createCommentToSingleLine(1, "Comment with faulty line", pos);

        const summary = "Review with fallback";
        const result = await provider.createPullRequestComment(1, summary);

        // Verification: issue comment fallback was executed
        expect(result.id).toBe(701);
        expect(result.body).toBe(summary);

        const issueCommentReq = receivedRequestList.find(
            (r) => r.method === "POST" && r.url === "/api/v1/repos/acme/project/issues/1/comments",
        );
        expect(issueCommentReq).toBeDefined();
        expect((issueCommentReq?.body as Record<string, unknown>)?.body).toBe(summary);
    });

    it("supports approving a pull request via native review endpoint", async () => {
        const baseUrl = startMockServer();
        const provider = new GiteaProvider(baseUrl, "test_token", "acme", "project", 42);

        await provider.approvePullRequest(1);

        const approveReq = receivedRequestList.find(
            (r) => r.method === "POST" && r.url === "/api/v1/repos/acme/project/pulls/1/reviews",
        );
        expect(approveReq).toBeDefined();
        const payload = approveReq?.body as Record<string, unknown>;
        expect(payload.event).toBe("APPROVE");
    });

    it("supports dismissing pull request approval", async () => {
        const baseUrl = startMockServer((req, url) => {
            if (url.pathname.endsWith("/user") && req.method === "GET") {
                return new Response(JSON.stringify({ login: "proval-bot" }), {
                    status: 200,
                    headers: { "Content-Type": "application/json" },
                });
            }
            if (url.pathname.endsWith("/reviews") && req.method === "GET") {
                return new Response(
                    JSON.stringify([
                        { id: 801, state: "APPROVED", user: { login: "proval-bot" } },
                    ]),
                    { status: 200, headers: { "Content-Type": "application/json" } },
                );
            }
            if (url.pathname.includes("/reviews/801/dismissals") && req.method === "POST") {
                return new Response(JSON.stringify({ ok: true }), {
                    status: 200,
                    headers: { "Content-Type": "application/json" },
                });
            }
            return null;
        });

        const provider = new GiteaProvider(baseUrl, "test_token", "acme", "project", 42);

        await provider.unapprovePullRequest(1);

        const dismissReq = receivedRequestList.find(
            (r) => r.method === "POST" && r.url === "/api/v1/repos/acme/project/pulls/1/reviews/801/dismissals",
        );
        expect(dismissReq).toBeDefined();
        expect((dismissReq?.body as Record<string, unknown>)?.message).toBe("Dismissed by bot");
    });

    it("supports adding 👍 reaction on pull request evaluation", async () => {
        const baseUrl = startMockServer();
        const provider = new GiteaProvider(baseUrl, "test_token", "acme", "project", 42);

        await provider.addEmoji({ type: "pull_request", prIid: 1 }, "👍");

        const reactionReq = receivedRequestList.find(
            (r) => r.method === "POST" && r.url === "/api/v1/repos/acme/project/issues/1/reactions",
        );
        expect(reactionReq).toBeDefined();
        expect((reactionReq?.body as Record<string, unknown>)?.content).toBe("+1");
    });

    it("supports removing 👀 reaction with DELETE and body payload", async () => {
        const baseUrl = startMockServer();
        const provider = new GiteaProvider(baseUrl, "test_token", "acme", "project", 42);

        await provider.removeEmoji({ type: "pull_request", prIid: 1 }, "👀");

        const reactionReq = receivedRequestList.find(
            (r) => r.method === "DELETE" && r.url === "/api/v1/repos/acme/project/issues/1/reactions",
        );
        expect(reactionReq).toBeDefined();
        expect((reactionReq?.body as Record<string, unknown>)?.content).toBe("eyes");
    });

    it("fetches and builds inline reviews with conversation threads", async () => {
        const baseUrl = startMockServer((req, url) => {
            if (url.pathname.endsWith("/reviews") && req.method === "GET") {
                return new Response(
                    JSON.stringify([
                        { id: 901, comments_count: 2 },
                        { id: 902, comments_count: 0 },
                    ]),
                    { status: 200, headers: { "Content-Type": "application/json" } },
                );
            }
            if (url.pathname.includes("/reviews/901/comments") && req.method === "GET") {
                return new Response(
                    JSON.stringify([
                        {
                            id: 2001,
                            body: "Initial root finding",
                            user: { login: "proval-bot" },
                            created_at: "2026-11-09T16:00:00Z",
                            path: "src/api.ts",
                            new_position: 15,
                            old_position: 0,
                            pull_request_review_id: 901,
                        },
                        {
                            id: 2002,
                            body: "Developer reply to finding",
                            user: { login: "developer" },
                            created_at: "2026-11-09T16:05:00Z",
                            path: "src/api.ts",
                            new_position: 15,
                            old_position: 0,
                            in_reply_to: 2001,
                            pull_request_review_id: 901,
                        },
                    ]),
                    { status: 200, headers: { "Content-Type": "application/json" } },
                );
            }
            return null;
        });

        const provider = new GiteaProvider(baseUrl, "test_token", "acme", "project", 42);

        const inlineReviewList = await provider.fetchPullRequestInlineReviewList(1);
        expect(inlineReviewList.length).toBe(1);
        expect(inlineReviewList[0].id).toBe("2001");
        expect(inlineReviewList[0].commentList.length).toBe(2);
        expect(inlineReviewList[0].commentList[0].body).toBe("Initial root finding");
        expect(inlineReviewList[0].commentList[1].body).toBe("Developer reply to finding");
    });

    it("replies to an existing inline review thread", async () => {
        const baseUrl = startMockServer((req, url) => {
            if (url.pathname.endsWith("/reviews") && req.method === "GET") {
                return new Response(
                    JSON.stringify([{ id: 901, comments_count: 1 }]),
                    { status: 200, headers: { "Content-Type": "application/json" } },
                );
            }
            if (url.pathname.includes("/reviews/901/comments") && req.method === "GET") {
                return new Response(
                    JSON.stringify([
                        {
                            id: 2001,
                            body: "Question about null check",
                            user: { login: "developer" },
                            created_at: "2026-11-09T16:00:00Z",
                            path: "src/api.ts",
                            new_position: 15,
                            pull_request_review_id: 901,
                        },
                    ]),
                    { status: 200, headers: { "Content-Type": "application/json" } },
                );
            }
            if (url.pathname.includes("/reviews/901/comments") && req.method === "POST") {
                return new Response(
                    JSON.stringify({
                        id: 2003,
                        body: "Yes, it handles null correctly now.",
                        user: { login: "proval-bot" },
                        created_at: "2026-11-09T16:10:00Z",
                    }),
                    { status: 201, headers: { "Content-Type": "application/json" } },
                );
            }
            return null;
        });

        const provider = new GiteaProvider(baseUrl, "test_token", "acme", "project", 42);

        const replyComment = await provider.replyToPullRequestInlineReview(
            1,
            "2001",
            "Yes, it handles null correctly now.",
        );

        expect(replyComment.id).toBe(2003);
        expect(replyComment.body).toBe("Yes, it handles null correctly now.");

        const postReq = receivedRequestList.find(
            (r) => r.method === "POST" && r.url === "/api/v1/repos/acme/project/pulls/1/reviews/901/comments",
        );
        expect(postReq).toBeDefined();
        expect((postReq?.body as Record<string, unknown>)?.body).toBe("Yes, it handles null correctly now.");
    });

    it("simulates full writing agent tool flow: inline comments, review summary, and evaluation", async () => {
        const baseUrl = startMockServer();
        const provider = new GiteaProvider(baseUrl, "test_token", "acme", "project", 42);

        spyOn(CommentService.prototype, "create").mockResolvedValue({ id: 1 } as unknown as void);

        const mockDiff: GitDiff = {
            oldPath: "src/calc.ts",
            newPath: "src/calc.ts",
            newFile: false,
            renamedFile: false,
            deletedFile: false,
            diff: `@@ -1,5 +1,8 @@
 function add(a: number, b: number) {
-  return a - b;
+  if (a == null) throw new Error("null");
+  return a + b;
 }
`,
        };

        const mockWorkspace = {
            getFileDiff: async () => mockDiff,
        } as unknown as Workspace;

        // 1. Single line comment tool
        const singleTool = createSingleLineCommentTool(provider, mockWorkspace, 1, "English", "base", "head", "start", 10);
        const singleResult = await singleTool.execute({
            level: "critical",
            title: "Check for undefined as well",
            body: "The check should test both null and undefined.",
            position: {
                oldPath: "src/calc.ts",
                newPath: "src/calc.ts",
                newLine: 2,
            },
        });
        expect((singleResult as { id: number }).id).toBeLessThan(0);

        // 2. Post review summary tool
        const summaryTool = postPullRequestCommentTool(provider, 1, "English", 10);
        const summaryResult = await summaryTool.execute({
            body: "## Code Review Overview\n\nIdentified 1 issue in calculator addition logic.",
        });
        expect((summaryResult as { id: number }).id).toBe(501);

        // 3. Evaluation tool
        const evalTool = evaluatePullRequestTool(provider, 1);
        const evalResult = await evalTool.execute({
            isGood: true,
        });
        expect(evalResult).toEqual({ evaluated: true, isGood: true });

        // Verify request payload sent to Gitea
        const reviewReq = receivedRequestList.find((r) => r.method === "POST" && r.url === "/api/v1/repos/acme/project/pulls/1/reviews");
        expect(reviewReq).toBeDefined();
        const payload = reviewReq?.body as Record<string, unknown>;
        expect(payload.body).toContain("## Code Review Overview");
        expect(payload.event).toBe("COMMENT");
        const comments = payload.comments as Array<{ path: string; new_position: number; body: string }>;
        expect(comments.length).toBe(1);
        expect(comments[0].path).toBe("src/calc.ts");
        expect(comments[0].new_position).toBe(2);
        expect(comments[0].body).toContain("Check for undefined as well");
    });
});
