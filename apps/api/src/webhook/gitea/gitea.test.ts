import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { createHmac } from "node:crypto";
import { Hono } from "hono";

process.env.ENCRYPTION_KEY = Buffer.alloc(32, 23).toString("base64");

import { parseGiteaWebhook, verifyGiteaWebhook, verifyGiteaSignature } from "./gitea.middleware.js";
import { handleGiteaWebhook } from "./gitea.controller.js";
import { handleClosedPullRequestReview } from "../webhook.middleware.js";
import { GiteaProvider } from "../../git-provider/gitea.js";
import { activityQueue } from "../../api/activity/activity.queue.js";
import { ActivityService } from "../../api/activity/activity.service.js";
import { CommentService } from "../../api/comment/comment.service.js";
import * as loadRepositoryModule from "../load-repository.middleware.js";
import { GitLabAccessService } from "../../api/access/access.service.js";
import { encrypt } from "../../util/encrypt.js";
import type { Access, ModelProvider, Repository } from "@proval/types";

describe("Gitea Webhook Signature Verification", () => {
    const secret = "test_webhook_secret_123";
    const body = JSON.stringify({ action: "opened", repository: { id: 42 } });

    it("verifies valid raw hex signature", () => {
        const signature = createHmac("sha256", secret).update(body, "utf8").digest("hex");
        expect(verifyGiteaSignature(secret, body, signature)).toBe(true);
    });

    it("verifies valid signature with sha256= prefix", () => {
        const hex = createHmac("sha256", secret).update(body, "utf8").digest("hex");
        expect(verifyGiteaSignature(secret, body, `sha256=${hex}`)).toBe(true);
    });

    it("rejects invalid signature", () => {
        const invalidSig = createHmac("sha256", "wrong_secret").update(body, "utf8").digest("hex");
        expect(verifyGiteaSignature(secret, body, invalidSig)).toBe(false);
    });

    it("rejects missing signature header", () => {
        expect(verifyGiteaSignature(secret, body, undefined)).toBe(false);
    });

    it("rejects empty secret", () => {
        const signature = createHmac("sha256", secret).update(body, "utf8").digest("hex");
        expect(verifyGiteaSignature("", body, signature)).toBe(false);
    });

    it("rejects corrupted hex signature", () => {
        expect(verifyGiteaSignature(secret, body, "not_a_valid_hex_string")).toBe(false);
    });
});

describe("Gitea Webhook Middleware", () => {
    const secret = "my_gitea_secret";
    const encryptedSecret = encrypt(secret);

    let fetchWebhookContextRowSpy: ReturnType<typeof spyOn>;
    let findForAutoCreateSpy: ReturnType<typeof spyOn>;
    let collaboratorSpy: ReturnType<typeof spyOn>;

    beforeEach(() => {
        fetchWebhookContextRowSpy = spyOn(loadRepositoryModule, "fetchWebhookContextRow");
        findForAutoCreateSpy = spyOn(GitLabAccessService.prototype, "findForAutoCreate");
        collaboratorSpy = spyOn(GiteaProvider.prototype, "isConnectedAccountCollaborator").mockResolvedValue(true);
    });

    afterEach(() => {
        fetchWebhookContextRowSpy.mockRestore();
        findForAutoCreateSpy.mockRestore();
        collaboratorSpy.mockRestore();
    });

    it("returns 400 when body is invalid JSON", async () => {
        const app = new Hono();
        app.post("/webhook/gitea", parseGiteaWebhook);

        const response = await app.request("/webhook/gitea", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "invalid-json-body{",
        });

        expect(response.status).toBe(400);
        const data = await response.json();
        expect(data.error).toBe("Invalid JSON body");
    });

    it("returns 400 when repository id is missing in payload", async () => {
        const app = new Hono();
        app.post("/webhook/gitea", parseGiteaWebhook);

        const response = await app.request("/webhook/gitea", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "opened" }),
        });

        expect(response.status).toBe(400);
        const data = await response.json();
        expect(data.error).toBe("Missing repository in payload");
    });

    it("returns 401 when signature is invalid for existing repository", async () => {
        fetchWebhookContextRowSpy.mockResolvedValue({
            repository: {
                id: 1,
                path: "testowner/testrepo",
                provider: "gitea",
                webhookSecret: encryptedSecret,
            } as Repository,
            modelProvider: { id: 10 } as ModelProvider,
            access: { id: 5, baseUrl: "https://gitea.example.com", accessToken: encrypt("token") } as Access,
        });

        const app = new Hono();
        app.post("/webhook/gitea", parseGiteaWebhook, verifyGiteaWebhook);

        const body = JSON.stringify({ action: "opened", repository: { id: 100 } });
        const response = await app.request("/webhook/gitea", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Gitea-Signature": "invalid_signature",
            },
            body,
        });

        expect(response.status).toBe(401);
        const data = await response.json();
        expect(data.error).toBe("Invalid webhook signature");
    });

    it("returns 401 when webhook secret is not configured in repository", async () => {
        fetchWebhookContextRowSpy.mockResolvedValue({
            repository: {
                id: 1,
                path: "testowner/testrepo",
                provider: "gitea",
                webhookSecret: null,
            } as Repository,
            modelProvider: { id: 10 } as ModelProvider,
            access: { id: 5, baseUrl: "https://gitea.example.com", accessToken: encrypt("token") } as Access,
        });

        const app = new Hono();
        app.post("/webhook/gitea", parseGiteaWebhook, verifyGiteaWebhook);

        const body = JSON.stringify({ action: "opened", repository: { id: 100 } });
        const response = await app.request("/webhook/gitea", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Gitea-Signature": "some_sig",
            },
            body,
        });

        expect(response.status).toBe(401);
        const data = await response.json();
        expect(data.error).toBe("Webhook secret not configured");
    });

    it("passes verification for existing repository with valid signature", async () => {
        fetchWebhookContextRowSpy.mockResolvedValue({
            repository: {
                id: 1,
                path: "testowner/testrepo",
                provider: "gitea",
                webhookSecret: encryptedSecret,
            } as Repository,
            modelProvider: { id: 10 } as ModelProvider,
            access: { id: 5, baseUrl: "https://gitea.example.com", accessToken: encrypt("token") } as Access,
        });

        let nextCalled = false;
        const app = new Hono();
        app.post("/webhook/gitea", parseGiteaWebhook, verifyGiteaWebhook, (c) => {
            nextCalled = true;
            return c.json({ ok: true });
        });

        const body = JSON.stringify({ action: "opened", repository: { id: 100 } });
        const signature = createHmac("sha256", secret).update(body, "utf8").digest("hex");

        const response = await app.request("/webhook/gitea", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Gitea-Signature": signature,
            },
            body,
        });

        expect(response.status).toBe(200);
        expect(nextCalled).toBe(true);
    });

    it("auto-creates repository when access is found and signature matches default secret", async () => {
        fetchWebhookContextRowSpy.mockResolvedValue(null);
        findForAutoCreateSpy.mockResolvedValue({
            id: 5,
            baseUrl: "https://gitea.example.com",
            accessToken: encrypt("token"),
            defaultWebhookSecret: encryptedSecret,
        } as Access);

        let nextCalled = false;
        const app = new Hono();
        app.post("/webhook/gitea", parseGiteaWebhook, verifyGiteaWebhook, (c) => {
            nextCalled = true;
            return c.json({ ok: true });
        });

        const body = JSON.stringify({
            action: "opened",
            repository: {
                id: 200,
                full_name: "testorg/testrepo",
                html_url: "https://gitea.example.com/testorg/testrepo",
            },
        });
        const signature = createHmac("sha256", secret).update(body, "utf8").digest("hex");

        const response = await app.request("/webhook/gitea", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Gitea-Signature": signature,
            },
            body,
        });

        expect(response.status).toBe(200);
        expect(nextCalled).toBe(true);
    });
});

describe("Gitea Webhook Controller & Pull Request Processing", () => {
    let activityQueuePushSpy: ReturnType<typeof spyOn>;
    let activityQueueDrainSpy: ReturnType<typeof spyOn>;
    let changedFileCountSpy: ReturnType<typeof spyOn>;
    let fetchVersionSpy: ReturnType<typeof spyOn>;
    let permissionSpy: ReturnType<typeof spyOn>;
    let findLastReviewedHeadShaSpy: ReturnType<typeof spyOn>;

    const defaultRepository: Repository = {
        id: 1,
        path: "owner/repo",
        provider: "gitea",
        prEnabled: true,
        prReviewEnabled: true,
        prReviewOnPush: "on_every_push",
        prReviewOnClose: "continue",
        prIgnoreDraft: true,
        prAllowedTargetBranchList: [],
        prMinAccessLevel: 0,
        modelName: "test-model",
        gitProviderRepositoryId: 42,
    } as Repository;

    const defaultModelProvider: ModelProvider = {
        id: 10,
        label: "OpenAI",
    } as ModelProvider;

    const defaultAccess: Access = {
        id: 5,
        baseUrl: "https://gitea.example.com",
        accessToken: "decrypted_token",
    } as Access;

    beforeEach(() => {
        activityQueuePushSpy = spyOn(activityQueue, "push").mockResolvedValue(99);
        activityQueueDrainSpy = spyOn(activityQueue, "drain").mockImplementation(() => {});
        changedFileCountSpy = spyOn(GiteaProvider.prototype, "fetchPullRequestChangedFileCount").mockResolvedValue(3);
        fetchVersionSpy = spyOn(GiteaProvider.prototype, "fetchPullRequestVersion").mockResolvedValue({
            headSha: "head_sha_123",
            baseSha: "base_sha_456",
        });
        permissionSpy = spyOn(GiteaProvider.prototype, "fetchUserPermission").mockResolvedValue(4);
        findLastReviewedHeadShaSpy = spyOn(ActivityService.prototype, "findLastReviewedHeadSha").mockResolvedValue(null);
    });

    afterEach(() => {
        activityQueuePushSpy.mockRestore();
        activityQueueDrainSpy.mockRestore();
        changedFileCountSpy.mockRestore();
        fetchVersionSpy.mockRestore();
        permissionSpy.mockRestore();
        findLastReviewedHeadShaSpy.mockRestore();
    });

    function createTestApp(repoOverrides: Partial<Repository> = {}) {
        const repo = { ...defaultRepository, ...repoOverrides };
        const app = new Hono<{
            Variables: {
                repository: Repository;
                modelProvider: ModelProvider;
                access: Access;
                giteaPayload: unknown;
            };
        }>();

        app.post("/webhook/gitea", async (c, next) => {
            const payload = await c.req.json();
            c.set("repository", repo);
            c.set("modelProvider", defaultModelProvider);
            c.set("access", defaultAccess);
            c.set("giteaPayload", payload);
            await next();
        }, handleGiteaWebhook);

        return app;
    }

    function createPullRequestPayload(overrides: Record<string, unknown> = {}) {
        return {
            action: "opened",
            number: 7,
            pull_request: {
                number: 7,
                title: "Add awesome feature",
                body: "This PR introduces a new feature",
                state: "open",
                merged: false,
                draft: false,
                base: { ref: "main" },
                head: { sha: "head_sha_123" },
                user: { login: "alice" },
            },
            repository: {
                id: 42,
                full_name: "owner/repo",
                name: "repo",
                owner: { login: "owner" },
            },
            ...overrides,
        };
    }

    it("skips unsupported events with 200 OK", async () => {
        const app = createTestApp();
        const payload = createPullRequestPayload();

        const response = await app.request("/webhook/gitea", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Gitea-Event": "ping",
            },
            body: JSON.stringify(payload),
        });

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.message).toBe("Skipped: event 'ping' is not supported");
        expect(activityQueuePushSpy).not.toHaveBeenCalled();
    });

    it("skips unsupported PR actions (e.g. labeled) with 200 OK", async () => {
        const app = createTestApp();
        const payload = createPullRequestPayload({ action: "labeled" });

        const response = await app.request("/webhook/gitea", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Gitea-Event": "pull_request",
            },
            body: JSON.stringify(payload),
        });

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.message).toBe("Skipped: action 'labeled'");
        expect(activityQueuePushSpy).not.toHaveBeenCalled();
    });

    it("skips review when prReviewEnabled is false", async () => {
        const app = createTestApp({ prReviewEnabled: false });
        const payload = createPullRequestPayload({ action: "opened" });

        const response = await app.request("/webhook/gitea", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Gitea-Event": "pull_request",
            },
            body: JSON.stringify(payload),
        });

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.message).toBe("Skipped: review is off");
        expect(activityQueuePushSpy).not.toHaveBeenCalled();
    });

    it("skips draft pull request when prIgnoreDraft is true", async () => {
        const app = createTestApp({ prIgnoreDraft: true });
        const payload = createPullRequestPayload({
            action: "opened",
            pull_request: {
                number: 7,
                title: "WIP feature",
                body: "Draft",
                state: "open",
                merged: false,
                draft: true,
                base: { ref: "main" },
                head: { sha: "head_sha_123" },
                user: { login: "alice" },
            },
        });

        const response = await app.request("/webhook/gitea", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Gitea-Event": "pull_request",
            },
            body: JSON.stringify(payload),
        });

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.message).toBe("Skipped: draft pull request");
        expect(activityQueuePushSpy).not.toHaveBeenCalled();
    });

    it("queues review when draft PR is ready_for_review", async () => {
        const app = createTestApp({ prIgnoreDraft: true });
        const payload = createPullRequestPayload({
            action: "ready_for_review",
            pull_request: {
                number: 7,
                title: "WIP feature now ready",
                body: "Ready",
                state: "open",
                merged: false,
                draft: false,
                base: { ref: "main" },
                head: { sha: "head_sha_123" },
                user: { login: "alice" },
            },
        });

        const response = await app.request("/webhook/gitea", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Gitea-Event": "pull_request",
            },
            body: JSON.stringify(payload),
        });

        expect(response.status).toBe(202);
        const data = await response.json();
        expect(data.message).toBe("Review queued");
        expect(activityQueuePushSpy).toHaveBeenCalledWith({
            repositoryId: 1,
            modelProviderId: 10,
            modelName: "test-model",
            type: "pr_review",
            targetIid: 7,
            headSha: "head_sha_123",
        });
        expect(activityQueueDrainSpy).toHaveBeenCalled();
    });

    it("skips review when target branch is not in allowed target branches", async () => {
        const app = createTestApp({ prAllowedTargetBranchList: ["main", "release/*"] });
        const payload = createPullRequestPayload({
            action: "opened",
            pull_request: {
                number: 7,
                title: "Feature",
                body: null,
                state: "open",
                merged: false,
                draft: false,
                base: { ref: "develop" },
                head: { sha: "head_sha_123" },
                user: { login: "alice" },
            },
        });

        const response = await app.request("/webhook/gitea", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Gitea-Event": "pull_request",
            },
            body: JSON.stringify(payload),
        });

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.message).toBe("Skipped: target branch 'develop' is not allowed");
        expect(activityQueuePushSpy).not.toHaveBeenCalled();
    });

    it("skips review when author has insufficient permissions", async () => {
        permissionSpy.mockResolvedValue(1); // Read-only access
        const app = createTestApp({ prMinAccessLevel: 3 }); // Requires Write (3)
        const payload = createPullRequestPayload({ action: "opened" });

        const response = await app.request("/webhook/gitea", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Gitea-Event": "pull_request",
            },
            body: JSON.stringify(payload),
        });

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.message).toBe("Skipped: insufficient permission");
        expect(activityQueuePushSpy).not.toHaveBeenCalled();
    });

    it("skips review when PR has no changed files", async () => {
        changedFileCountSpy.mockResolvedValue(0);
        const app = createTestApp();
        const payload = createPullRequestPayload({ action: "opened" });

        const response = await app.request("/webhook/gitea", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Gitea-Event": "pull_request",
            },
            body: JSON.stringify(payload),
        });

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.message).toBe("Skipped: no changed files");
        expect(activityQueuePushSpy).not.toHaveBeenCalled();
    });

    it("skips review when head SHA was already reviewed (idempotency)", async () => {
        findLastReviewedHeadShaSpy.mockResolvedValue("head_sha_123");
        const app = createTestApp();
        const payload = createPullRequestPayload({ action: "opened" });

        const response = await app.request("/webhook/gitea", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Gitea-Event": "pull_request",
            },
            body: JSON.stringify(payload),
        });

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.message).toBe("Skipped: head already reviewed");
        expect(activityQueuePushSpy).not.toHaveBeenCalled();
    });

    it("skips push while pull request is closed", async () => {
        const app = createTestApp();
        const payload = createPullRequestPayload({
            action: "synchronize",
            pull_request: {
                number: 7,
                title: "Closed PR",
                body: null,
                state: "closed",
                merged: false,
                base: { ref: "main" },
                head: { sha: "head_sha_999" },
                user: { login: "alice" },
            },
        });

        const response = await app.request("/webhook/gitea", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Gitea-Event": "pull_request",
            },
            body: JSON.stringify(payload),
        });

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.message).toBe("Skipped: pull request is closed");
        expect(activityQueuePushSpy).not.toHaveBeenCalled();
    });

    it("successfully queues review on PR opened event", async () => {
        const app = createTestApp();
        const payload = createPullRequestPayload({ action: "opened" });

        const response = await app.request("/webhook/gitea", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Gitea-Event": "pull_request",
            },
            body: JSON.stringify(payload),
        });

        expect(response.status).toBe(202);
        const data = await response.json();
        expect(data.message).toBe("Review queued");
        expect(activityQueuePushSpy).toHaveBeenCalledWith({
            repositoryId: 1,
            modelProviderId: 10,
            modelName: "test-model",
            type: "pr_review",
            targetIid: 7,
            headSha: "head_sha_123",
        });
        expect(activityQueueDrainSpy).toHaveBeenCalled();
    });

    it("successfully queues review on PR synchronize event", async () => {
        const app = createTestApp();
        const payload = createPullRequestPayload({ action: "synchronize" });

        const response = await app.request("/webhook/gitea", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Gitea-Event": "pull_request_sync",
            },
            body: JSON.stringify(payload),
        });

        expect(response.status).toBe(202);
        const data = await response.json();
        expect(data.message).toBe("Review queued");
        expect(activityQueuePushSpy).toHaveBeenCalled();
    });

    it("successfully queues review on PR reopened event", async () => {
        const app = createTestApp();
        const payload = createPullRequestPayload({ action: "reopened" });

        const response = await app.request("/webhook/gitea", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Gitea-Event": "pull_request",
            },
            body: JSON.stringify(payload),
        });

        expect(response.status).toBe(202);
        const data = await response.json();
        expect(data.message).toBe("Review queued");
        expect(activityQueuePushSpy).toHaveBeenCalled();
    });
});

describe("Gitea Closed and Merged Pull Request Handling", () => {
    let cancelSpy: ReturnType<typeof spyOn>;
    let findInFlightSpy: ReturnType<typeof spyOn>;

    beforeEach(() => {
        cancelSpy = spyOn(ActivityService.prototype, "cancel").mockResolvedValue(true as unknown as void);
        findInFlightSpy = spyOn(ActivityService.prototype, "findInFlightPullRequestReviewList").mockResolvedValue([
            { id: 101, status: "queued" } as unknown as { id: number; status: string },
        ]);
    });

    afterEach(() => {
        cancelSpy.mockRestore();
        findInFlightSpy.mockRestore();
    });

    function createClosedApp(prReviewOnClose: "cancel" | "continue" | "continue_if_started") {
        const repo: Repository = {
            id: 1,
            path: "owner/repo",
            provider: "gitea",
            prReviewOnClose,
        } as Repository;

        const app = new Hono<{
            Variables: {
                repository: Repository;
                giteaPayload: unknown;
            };
        }>();

        app.post("/webhook/gitea", async (c, next) => {
            const payload = await c.req.json();
            c.set("repository", repo);
            c.set("giteaPayload", payload);
            await next();
        }, handleClosedPullRequestReview, (c) => c.json({ controller: true }));

        return app;
    }

    it("cancels in-flight review when PR is closed and policy is cancel", async () => {
        const app = createClosedApp("cancel");
        const payload = {
            action: "closed",
            number: 12,
            pull_request: { number: 12, merged: false },
        };

        const response = await app.request("/webhook/gitea", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Gitea-Event": "pull_request",
            },
            body: JSON.stringify(payload),
        });

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.message).toBe("Canceled in-flight review");
        expect(cancelSpy).toHaveBeenCalledWith(101, "Canceled because the pull request was closed");
    });

    it("cancels in-flight review when PR is merged and policy is cancel", async () => {
        const app = createClosedApp("cancel");
        const payload = {
            action: "merged",
            number: 12,
            pull_request: { number: 12, merged: true },
        };

        const response = await app.request("/webhook/gitea", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Gitea-Event": "pull_request",
            },
            body: JSON.stringify(payload),
        });

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.message).toBe("Canceled in-flight review");
        expect(cancelSpy).toHaveBeenCalledWith(101, "Canceled because the pull request was merged");
    });

    it("continues review when PR is closed and policy is continue", async () => {
        const app = createClosedApp("continue");
        const payload = {
            action: "closed",
            number: 12,
            pull_request: { number: 12, merged: false },
        };

        const response = await app.request("/webhook/gitea", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Gitea-Event": "pull_request",
            },
            body: JSON.stringify(payload),
        });

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.message).toBe("Skipped: continue after close");
        expect(cancelSpy).not.toHaveBeenCalled();
    });
});

describe("Gitea Issues and Comments Webhook Processing", () => {
    let activityQueuePushSpy: ReturnType<typeof spyOn>;
    let activityQueueDrainSpy: ReturnType<typeof spyOn>;
    let fetchCurrentUserSpy: ReturnType<typeof spyOn>;
    let commentFindSpy: ReturnType<typeof spyOn>;
    let resolvePrReplyTargetSpy: ReturnType<typeof spyOn>;
    let resolveReviewedPrReplyTargetSpy: ReturnType<typeof spyOn>;
    let permissionSpy: ReturnType<typeof spyOn>;

    const defaultRepository: Repository = {
        id: 1,
        path: "owner/repo",
        provider: "gitea",
        prEnabled: true,
        prReplyEnabled: true,
        prMentionOnly: false,
        prMinAccessLevel: 0,
        issueEnabled: true,
        issueCommentOnOpenEnabled: true,
        issueReplyEnabled: true,
        issueMentionOnly: false,
        issueMinAccessLevel: 0,
        modelName: "test-model",
        gitProviderRepositoryId: 42,
    } as Repository;

    const defaultModelProvider: ModelProvider = {
        id: 10,
        label: "OpenAI",
    } as ModelProvider;

    const defaultAccess: Access = {
        id: 5,
        baseUrl: "https://gitea.example.com",
        accessToken: "decrypted_token",
    } as Access;

    beforeEach(() => {
        activityQueuePushSpy = spyOn(activityQueue, "push").mockResolvedValue(99);
        activityQueueDrainSpy = spyOn(activityQueue, "drain").mockImplementation(() => {});
        fetchCurrentUserSpy = spyOn(GiteaProvider.prototype, "fetchCurrentUser").mockResolvedValue({
            username: "proval-bot",
        });
        commentFindSpy = spyOn(CommentService.prototype, "find").mockResolvedValue(null);
        resolvePrReplyTargetSpy = spyOn(GiteaProvider.prototype, "resolvePrReplyTarget").mockResolvedValue({
            commentId: 10,
            inlineReviewId: null,
        });
        resolveReviewedPrReplyTargetSpy = spyOn(GiteaProvider.prototype, "resolveReviewedPrReplyTarget").mockResolvedValue({
            commentId: 10,
            inlineReviewId: "5",
        });
        permissionSpy = spyOn(GiteaProvider.prototype, "fetchUserPermission").mockResolvedValue(4);
    });

    afterEach(() => {
        activityQueuePushSpy.mockRestore();
        activityQueueDrainSpy.mockRestore();
        fetchCurrentUserSpy.mockRestore();
        commentFindSpy.mockRestore();
        resolvePrReplyTargetSpy.mockRestore();
        resolveReviewedPrReplyTargetSpy.mockRestore();
        permissionSpy.mockRestore();
    });

    function createApp(repoOverrides: Partial<Repository> = {}) {
        const repo = { ...defaultRepository, ...repoOverrides };
        const app = new Hono<{
            Variables: {
                repository: Repository;
                modelProvider: ModelProvider;
                access: Access;
                giteaPayload: unknown;
            };
        }>();

        app.post("/webhook/gitea", async (c, next) => {
            const rawBody = await c.req.raw.text();
            c.set("repository", repo);
            c.set("modelProvider", defaultModelProvider);
            c.set("access", defaultAccess);
            c.set("giteaPayload", JSON.parse(rawBody));
            await next();
        }, handleGiteaWebhook);

        return app;
    }

    it("queues issue comment when issue is opened", async () => {
        const app = createApp();
        const payload = {
            action: "opened",
            issue: { number: 5, title: "Test Issue", body: "Hello" },
            repository: { id: 1, full_name: "owner/repo", name: "repo", owner: { login: "owner" } },
        };

        const response = await app.request("/webhook/gitea", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Gitea-Event": "issues",
            },
            body: JSON.stringify(payload),
        });

        expect(response.status).toBe(202);
        const data = await response.json();
        expect(data.message).toBe("Issue comment queued");
        expect(activityQueuePushSpy).toHaveBeenCalledWith(expect.objectContaining({
            type: "issue_open",
            targetIid: 5,
        }));
    });

    it("skips issue comment when issueCommentOnOpenEnabled is false", async () => {
        const app = createApp({ issueCommentOnOpenEnabled: false });
        const payload = {
            action: "opened",
            issue: { number: 5, title: "Test Issue", body: "Hello" },
            repository: { id: 1, full_name: "owner/repo", name: "repo", owner: { login: "owner" } },
        };

        const response = await app.request("/webhook/gitea", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Gitea-Event": "issues",
            },
            body: JSON.stringify(payload),
        });

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.message).toBe("Skipped: issue comment on open is off");
        expect(activityQueuePushSpy).not.toHaveBeenCalled();
    });

    it("queues pull request reply on pull_request_comment event", async () => {
        const app = createApp();
        const payload = {
            action: "created",
            pull_request: { number: 10 },
            comment: { id: 123, body: "@proval-bot what do you think?", user: { login: "alice" } },
            repository: { id: 1, full_name: "owner/repo", name: "repo", owner: { login: "owner" } },
        };

        const response = await app.request("/webhook/gitea", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Gitea-Event": "pull_request_comment",
            },
            body: JSON.stringify(payload),
        });

        expect(response.status).toBe(202);
        const data = await response.json();
        expect(data.message).toBe("Reply queued");
        expect(activityQueuePushSpy).toHaveBeenCalledWith(expect.objectContaining({
            type: "pr_reply",
            targetIid: 10,
            targetCommentId: 10,
        }));
    });

    it("skips pull request reply when bot is not mentioned and prMentionOnly is true", async () => {
        const app = createApp({ prMentionOnly: true });
        const payload = {
            action: "created",
            pull_request: { number: 10 },
            comment: { id: 123, body: "just talking to bob", user: { login: "alice" } },
            repository: { id: 1, full_name: "owner/repo", name: "repo", owner: { login: "owner" } },
        };

        const response = await app.request("/webhook/gitea", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Gitea-Event": "pull_request_comment",
            },
            body: JSON.stringify(payload),
        });

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.message).toBe("Skipped: bot not mentioned");
        expect(activityQueuePushSpy).not.toHaveBeenCalled();
    });

    it("queues PR reply on reviewed action", async () => {
        const app = createApp();
        const payload = {
            action: "reviewed",
            pull_request: { number: 10 },
            review: {
                type: "comment",
                body: "@proval-bot review feedback",
                comments: [{ id: 456, body: "fix this", user: { login: "alice" } }],
            },
            repository: { id: 1, full_name: "owner/repo", name: "repo", owner: { login: "owner" } },
            sender: { login: "alice" },
        };

        const response = await app.request("/webhook/gitea", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Gitea-Event": "pull_request_review_comment",
            },
            body: JSON.stringify(payload),
        });

        expect(response.status).toBe(202);
        const data = await response.json();
        expect(data.message).toBe("Reply queued");
        expect(activityQueuePushSpy).toHaveBeenCalledWith(expect.objectContaining({
            type: "pr_reply",
            targetIid: 10,
            targetCommentId: 10,
            targetInlineReviewId: "5",
        }));
    });

    it("queues issue reply on issue_comment event", async () => {
        const app = createApp({ issueReplyEnabled: true, issueMentionOnly: false });
        const payload = {
            action: "created",
            issue: { number: 7 },
            comment: { id: 789, body: "here is a reply", user: { login: "bob" } },
            repository: { id: 1, full_name: "owner/repo", name: "repo", owner: { login: "owner" } },
        };

        const response = await app.request("/webhook/gitea", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Gitea-Event": "issue_comment",
            },
            body: JSON.stringify(payload),
        });

        expect(response.status).toBe(202);
        const data = await response.json();
        expect(data.message).toBe("Issue reply queued");
        expect(activityQueuePushSpy).toHaveBeenCalledWith(expect.objectContaining({
            type: "issue_reply",
            targetIid: 7,
            targetCommentId: 789,
        }));
    });
});
