import { afterAll, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { createHmac } from "node:crypto";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { AccessUpdateInput, RepositoryInsert } from "@proval/types";

// Keep real database integration isolated from the module mocks used by other API tests
if (process.env.PROVAL_WEBHOOK_TEST_CHILD !== "1") {
    it("passes webhook integration in an isolated process", () => {
        const result = Bun.spawnSync([process.execPath, "test", import.meta.path], {
            env: { ...process.env, PROVAL_WEBHOOK_TEST_CHILD: "1", DB_FILE_NAME: ":memory:" },
            stdout: "pipe",
            stderr: "pipe",
        });
        if (result.exitCode !== 0) {
            throw new Error(result.stdout.toString() + result.stderr.toString());
        }
        expect(result.exitCode).toBe(0);
    }, 30000);
} else {
    process.env.DB_FILE_NAME = ":memory:";
    process.env.ENCRYPTION_KEY = Buffer.alloc(32, 19).toString("base64");
    const { Hono } = await import("hono");
    const { migrate } = await import("drizzle-orm/bun-sqlite/migrator");
    const { eq } = await import("drizzle-orm");
    const { default: db } = await import("../db/index.js");
    const { repositoryTable, gitProviderAccessTable, modelProviderTable, githubAppTable, githubInstallationTable } =
        await import("@proval/db");
    const { encrypt, decrypt } = await import("../util/encrypt.js");
    const { GitLabProvider } = await import("../git-provider/gitlab.js");
    const { GitLabAccessService } = await import("../api/access/access.service.js");
    const { RepositoryService } = await import("../api/repository/repository.service.js");
    const controller = await import("../api/repository/repository.controller.js");
    const { updateAccessById } = await import("../api/access/access.controller.js");
    const { parseGitLabWebhook, verifyGitLabWebhook } = await import("./gitlab/gitlab.middleware.js");
    const { parseForgejoWebhook, verifyForgejoWebhook } = await import("./forgejo/forgejo.middleware.js");
    const { loadGitHubContext } = await import("./github/github.middleware.js");
    const { loadRepository } = await import("./load-repository.middleware.js");

    const migrationPath = resolve(import.meta.dir, "../../../../packages/db/src/migration");
    const temporaryPath = mkdtempSync(join(tmpdir(), "proval-webhook-"));
    const previousMigrationPath = join(temporaryPath, "migration");
    cpSync(migrationPath, previousMigrationPath, { recursive: true });
    const journalPath = join(previousMigrationPath, "meta/_journal.json");
    const journal = JSON.parse(readFileSync(journalPath, "utf8"));
    journal.entries = journal.entries.filter((entry: { idx: number }) => entry.idx <= 42);
    writeFileSync(journalPath, JSON.stringify(journal));
    migrate(db, { migrationsFolder: previousMigrationPath });

    const legacySecret = encrypt("legacy secret");
    db.$client.run("INSERT INTO repository (id, path, provider, webhook_secret) VALUES (1, 'group/old', 'gitlab', ?)", [
        legacySecret,
    ]);
    db.$client.run(
        "INSERT INTO activity (id, repository_id, repository_path, provider, model_name, type, status, target_iid) VALUES (1, 1, 'group/old', 'gitlab', 'test', 'pr_review', 'completed', 7)",
    );
    db.$client.run(
        "INSERT INTO comment (activity_id, body, type, comment_id) VALUES (1, 'Saved finding', 'comment', 11)",
    );
    db.$client.run(
        "INSERT INTO git_provider_access (provider, name, base_url, access_token, default_webhook_secret) VALUES ('gitlab', 'Old access', 'https://old.example', ?, ?)",
        [encrypt("access"), legacySecret],
    );
    const activityBefore = db.$client
        .query(
            "SELECT *, NULL AS log_version, NULL AS target_comment_id, NULL AS target_inline_review_id FROM activity",
        )
        .all();
    const commentBefore = db.$client.query("SELECT * FROM comment").all();
    migrate(db, { migrationsFolder: migrationPath });
    const migrationResult = {
        activity: db.$client.query("SELECT * FROM activity").all(),
        comment: db.$client.query("SELECT * FROM comment").all(),
        repository: db.$client.query("SELECT webhook_secret, webhook_signing_token FROM repository").get(),
        access: db.$client
            .query("SELECT default_webhook_secret, default_webhook_signing_token FROM git_provider_access")
            .get(),
        foreignKeyViolation: db.$client.query("PRAGMA foreign_key_check").all(),
    };

    const signingToken = `whsec_${Buffer.alloc(32, 3).toString("base64")}`;
    const otherSigningToken = `whsec_${Buffer.alloc(32, 4).toString("base64")}`;
    const secret = "legacy webhook secret";
    const rawBody =
        '{\n  "project": { "id": 100, "path_with_namespace": "group/repo", "web_url": "https://gitlab.example/group/repo" },\n  "description": "中文正文"\n}';
    const service = new RepositoryService();
    const accessService = new GitLabAccessService();
    const createProjectToken = spyOn(GitLabProvider, "createProjectAccessToken").mockResolvedValue({
        token: "project token",
        tokenId: 9,
    });
    const maintainerCheck = spyOn(GitLabProvider.prototype, "isConnectedAccountProjectMaintainer").mockResolvedValue(
        true,
    );
    const app = new Hono<{ Variables: { repository: { id: number } } }>();
    app.post("/repository", controller.createRepository);
    app.get("/repository", controller.findAllRepositoryController);
    app.get("/repository/:id", controller.findById);
    app.put("/repository/:id", controller.updateRepository);
    app.patch("/repository/:id/webhook-secret", controller.updateWebhookSecret);
    app.patch("/repository/:id/webhook-signing-token", controller.updateWebhookSigningToken);
    app.put("/access/:id", updateAccessById);
    app.post("/webhook/gitlab", parseGitLabWebhook, verifyGitLabWebhook, loadRepository, (c) =>
        c.json({ id: c.get("repository").id }),
    );
    app.post("/webhook/forgejo", parseForgejoWebhook, verifyForgejoWebhook, loadRepository, (c) =>
        c.json({ id: c.get("repository").id }),
    );
    app.post("/webhook/github", loadGitHubContext, (c) => c.json({ id: c.get("repository").id }));

    const defaultConfig: AccessUpdateInput = {
        name: "GitLab",
        baseUrl: "https://gitlab.example",
        autoCreateEnabled: true,
        defaultModelProviderId: 1,
        defaultModelName: "test",
        defaultLanguage: "English",
        defaultPrEnabled: true,
        defaultPrMinAccessLevel: 0,
        defaultPrReviewEnabled: true,
        defaultPrInlineReview: true,
        defaultPrReviewOnPush: "on_every_push",
        defaultPrIgnoreDraft: true,
        defaultPrReplyEnabled: true,
        defaultPrMentionOnly: false,
        defaultIssueEnabled: true,
        defaultIssueMinAccessLevel: 0,
        defaultIssueCommentOnOpenEnabled: true,
        defaultIssueLabelOnOpenEnabled: true,
        defaultIssueReplyEnabled: true,
        defaultIssueMentionOnly: false,
    };
    const repositoryInput: RepositoryInsert = {
        path: "group/repo",
        provider: "gitlab",
        gitProviderAccessId: 1,
        gitProviderRepositoryId: 100,
        modelProviderId: 1,
        modelName: "test",
    };

    function request(path: string, method: string, body: unknown) {
        return app.request(path, {
            method,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
    }

    function signatureHeader(body = rawBody, token = signingToken, offsetSecond = 0): Record<string, string> {
        const timestamp = String(Math.floor(Date.now() / 1000) + offsetSecond);
        const signature = createHmac("sha256", Buffer.from(token.slice(6), "base64"))
            .update(`delivery-id.${timestamp}.${body}`)
            .digest("base64");
        return { "webhook-id": "delivery-id", "webhook-timestamp": timestamp, "webhook-signature": `v1,${signature}` };
    }

    function deliver(header: Record<string, string>, body = rawBody) {
        return app.request("/webhook/gitlab", {
            method: "POST",
            body,
            headers: { "Content-Type": "application/json", ...header },
        });
    }

    async function storedRepository(id: number) {
        return (await db.select().from(repositoryTable).where(eq(repositoryTable.id, id)))[0];
    }

    beforeEach(async () => {
        db.$client.exec(
            "DELETE FROM comment; DELETE FROM activity; DELETE FROM repository; DELETE FROM git_provider_access; DELETE FROM github_installation; DELETE FROM github_app; DELETE FROM model_provider;",
        );
        await db.insert(modelProviderTable).values({
            id: 1,
            provider: "openai",
            label: "Test",
            baseUrl: "https://model.example",
            apiKey: encrypt("key"),
        });
        await db.insert(gitProviderAccessTable).values({
            id: 1,
            provider: "gitlab",
            name: "GitLab",
            baseUrl: "https://gitlab.example",
            accessToken: encrypt("access"),
        });
        createProjectToken.mockClear();
        maintainerCheck.mockClear();
        maintainerCheck.mockResolvedValue(true);
    });

    afterAll(() => {
        createProjectToken.mockRestore();
        maintainerCheck.mockRestore();
        db.$client.close();
        if (
            !resolve(temporaryPath).startsWith(resolve(tmpdir()) + "\\proval-webhook-") &&
            !resolve(temporaryPath).startsWith(resolve(tmpdir()) + "/proval-webhook-")
        ) {
            throw new Error("Unexpected temporary directory");
        }
        rmSync(temporaryPath, { recursive: true, force: true });
    });

    it("preserves existing credentials and activity links during database upgrade", () => {
        expect(migrationResult.activity).toEqual(activityBefore);
        expect(migrationResult.comment).toEqual(commentBefore);
        expect(migrationResult.repository).toEqual({ webhook_secret: legacySecret, webhook_signing_token: null });
        expect(migrationResult.access).toEqual({
            default_webhook_secret: legacySecret,
            default_webhook_signing_token: null,
        });
        expect(migrationResult.foreignKeyViolation).toEqual([]);
    });

    describe("repository credential API", () => {
        for (const credential of [
            { webhookSecret: secret },
            { webhookSigningToken: signingToken },
            { webhookSecret: secret, webhookSigningToken: signingToken },
        ]) {
            it(`creates and encrypts ${Object.keys(credential).join(" and ")}`, async () => {
                const response = await request("/repository", "POST", { ...repositoryInput, ...credential });
                expect(response.status).toBe(201);
                const body = await response.json();
                expect(body).not.toHaveProperty("webhookSecret");
                expect(body).not.toHaveProperty("webhookSigningToken");
                const stored = await storedRepository(body.id);
                expect(stored.webhookSecret ? decrypt(stored.webhookSecret) : null).toBe(
                    credential.webhookSecret ?? null,
                );
                expect(stored.webhookSigningToken ? decrypt(stored.webhookSigningToken) : null).toBe(
                    credential.webhookSigningToken ?? null,
                );
                for (const path of ["/repository", `/repository/${body.id}`]) {
                    const result = await (await app.request(path)).json();
                    const row = Array.isArray(result) ? result[0] : result;
                    expect(row).not.toHaveProperty("webhookSecret");
                    expect(row).not.toHaveProperty("webhookSigningToken");
                }
            });
        }

        it("requires at least one credential", async () => {
            expect((await request("/repository", "POST", repositoryInput)).status).toBe(400);
            expect(createProjectToken).not.toHaveBeenCalled();
        });

        for (const value of ["", " ", "wrong_prefix", "whsec_", "whsec_%%%", 42, {}]) {
            it(`rejects invalid signing input ${JSON.stringify(value)}`, async () => {
                const repository = await service.create({ ...repositoryInput, webhookSecret: secret });
                const response = await request(`/repository/${repository.id}/webhook-signing-token`, "PATCH", {
                    value,
                });
                expect(response.status).toBe(400);
                expect((await response.json()).error).toContain("Signing token");
                expect((await storedRepository(repository.id)).webhookSigningToken).toBeNull();
            });
        }

        it("validates a supplied signing token even when a secret is valid", async () => {
            expect(
                (
                    await request("/repository", "POST", {
                        ...repositoryInput,
                        webhookSecret: secret,
                        webhookSigningToken: "invalid",
                    })
                ).status,
            ).toBe(400);
        });

        it("updates each credential independently and trims signing input", async () => {
            const repository = await service.create({ ...repositoryInput, webhookSecret: secret });
            expect(
                (
                    await request(`/repository/${repository.id}/webhook-signing-token`, "PATCH", {
                        value: ` ${signingToken}\n`,
                    })
                ).status,
            ).toBe(200);
            let stored = await storedRepository(repository.id);
            expect(decrypt(stored.webhookSecret ?? "")).toBe(secret);
            expect(decrypt(stored.webhookSigningToken ?? "")).toBe(signingToken);
            const encryptedSigningToken = stored.webhookSigningToken;
            expect(
                (await request(`/repository/${repository.id}/webhook-secret`, "PATCH", { value: "replacement" }))
                    .status,
            ).toBe(200);
            stored = await storedRepository(repository.id);
            expect(decrypt(stored.webhookSecret ?? "")).toBe("replacement");
            expect(stored.webhookSigningToken).toBe(encryptedSigningToken);
        });

        for (const key of ["webhookSecret", "webhookSigningToken"]) {
            it(`rejects ${key} through ordinary updates`, async () => {
                const repository = await service.create({ ...repositoryInput, webhookSecret: secret });
                expect((await request(`/repository/${repository.id}`, "PUT", { [key]: signingToken })).status).toBe(
                    400,
                );
                expect(decrypt((await storedRepository(repository.id)).webhookSecret ?? "")).toBe(secret);
            });
        }

        it("returns 404 for an absent repository", async () => {
            expect(
                (await request("/repository/99999/webhook-signing-token", "PATCH", { value: signingToken })).status,
            ).toBe(404);
        });

        for (const provider of ["github", "forgejo"] as const) {
            it(`rejects signing credentials for ${provider}`, async () => {
                const body = {
                    path: "group/repo",
                    provider,
                    githubRepositoryId: 100,
                    gitProviderRepositoryId: 100,
                    webhookSecret: secret,
                };
                expect(
                    (await request("/repository", "POST", { ...body, webhookSigningToken: signingToken })).status,
                ).toBe(400);
                const response = await request("/repository", "POST", body);
                expect(response.status).toBe(201);
                const repository = await response.json();
                expect(
                    (
                        await request(`/repository/${repository.id}/webhook-signing-token`, "PATCH", {
                            value: signingToken,
                        })
                    ).status,
                ).toBe(400);
            });
        }
    });

    describe("GitLab delivery", () => {
        beforeEach(async () => {
            await service.create({ ...repositoryInput, webhookSecret: secret, webhookSigningToken: signingToken });
        });

        it("accepts a signature over the original Unicode body and a legacy request", async () => {
            expect((await deliver(signatureHeader())).status).toBe(200);
            expect(
                (await deliver({ "X-Gitlab-Token": secret, "webhook-id": "id", "webhook-timestamp": "0" })).status,
            ).toBe(200);
        });
        it("accepts any matching v1 signature", async () => {
            const header = signatureHeader();
            header["webhook-signature"] = `v2,unknown v1,invalid ${header["webhook-signature"]}`;
            expect((await deliver(header)).status).toBe(200);
        });
        it("rejects a changed body", async () => {
            expect((await deliver(signatureHeader(), rawBody.replace("中文正文", "changed"))).status).toBe(401);
        });
        it("rejects a wrong signing key without falling back to a valid secret", async () => {
            expect(
                (await deliver({ ...signatureHeader(rawBody, otherSigningToken), "X-Gitlab-Token": secret })).status,
            ).toBe(401);
        });
        for (const key of ["webhook-id", "webhook-timestamp"]) {
            it(`rejects a missing ${key}`, async () => {
                const header = signatureHeader();
                delete header[key];
                expect((await deliver(header)).status).toBe(401);
            });
        }
        for (const offset of [-600, 600]) {
            it(`rejects a timestamp offset of ${offset}`, async () => {
                expect((await deliver(signatureHeader(rawBody, signingToken, offset))).status).toBe(401);
            });
        }
        it("rejects an empty signature even with a valid secret", async () => {
            expect((await deliver({ "webhook-signature": "", "X-Gitlab-Token": secret })).status).toBe(401);
        });
        it("requires the credential for the incoming authentication type", async () => {
            await db.update(repositoryTable).set({ webhookSigningToken: null });
            expect((await deliver({ ...signatureHeader(), "X-Gitlab-Token": secret })).status).toBe(401);
            await db.update(repositoryTable).set({ webhookSecret: null, webhookSigningToken: encrypt(signingToken) });
            expect((await deliver(signatureHeader())).status).toBe(200);
            expect((await deliver({ "X-Gitlab-Token": secret })).status).toBe(401);
        });
        it("rejects missing or wrong legacy credentials", async () => {
            expect((await deliver({})).status).toBe(401);
            expect((await deliver({ "X-Gitlab-Token": "wrong" })).status).toBe(401);
        });
        it("returns 400 for malformed JSON or missing project data", async () => {
            for (const body of ["{", "null", "{}"]) expect((await deliver({}, body)).status).toBe(400);
        });
    });

    describe("automatic registration", () => {
        for (const credential of [
            { defaultWebhookSecret: secret },
            { defaultWebhookSigningToken: signingToken },
            { defaultWebhookSecret: secret, defaultWebhookSigningToken: signingToken },
        ]) {
            it(`registers with ${Object.keys(credential).join(" and ")}`, async () => {
                const response = await request("/access/1", "PUT", { ...defaultConfig, ...credential });
                expect(response.status).toBe(200);
                const access = await response.json();
                expect(access).not.toHaveProperty("defaultWebhookSecret");
                expect(access).not.toHaveProperty("defaultWebhookSigningToken");
                expect(access.hasDefaultWebhookSigningToken).toBe(Boolean(credential.defaultWebhookSigningToken));
                const header = credential.defaultWebhookSigningToken ? signatureHeader() : { "X-Gitlab-Token": secret };
                const delivery = await deliver(header);
                expect(delivery.status).toBe(200);
                const repository = await storedRepository((await delivery.json()).id);
                expect(repository.webhookSecret ? decrypt(repository.webhookSecret) : null).toBe(
                    credential.defaultWebhookSecret ?? null,
                );
                expect(repository.webhookSigningToken ? decrypt(repository.webhookSigningToken) : null).toBe(
                    credential.defaultWebhookSigningToken ?? null,
                );
                expect(repository.modelProviderId).toBe(1);
                expect(maintainerCheck).toHaveBeenCalledTimes(1);
                expect((await deliver(header)).status).toBe(200);
                expect(createProjectToken).toHaveBeenCalledTimes(1);
            });
        }
        it("keeps independent defaults on blank updates and clears them when disabled", async () => {
            await accessService.updateById(1, { ...defaultConfig, defaultWebhookSecret: secret });
            await accessService.updateById(1, { ...defaultConfig, defaultWebhookSigningToken: signingToken });
            const original = await accessService.findByIdRaw(1);
            await accessService.updateById(1, {
                ...defaultConfig,
                defaultWebhookSecret: " ",
                defaultWebhookSigningToken: " ",
            });
            const kept = await accessService.findByIdRaw(1);
            expect(kept.defaultWebhookSecret).toBe(original.defaultWebhookSecret);
            expect(kept.defaultWebhookSigningToken).toBe(original.defaultWebhookSigningToken);
            await accessService.updateById(1, { ...defaultConfig, autoCreateEnabled: false });
            const cleared = await accessService.findByIdRaw(1);
            expect(cleared.defaultWebhookSecret).toBeNull();
            expect(cleared.defaultWebhookSigningToken).toBeNull();
            expect(accessService.hasAutoCreateDefaultConfig(cleared)).toBe(false);
        });
        it("does not register or call GitLab on failed authentication", async () => {
            await accessService.updateById(1, {
                ...defaultConfig,
                defaultWebhookSecret: secret,
                defaultWebhookSigningToken: signingToken,
            });
            expect(
                (await deliver({ ...signatureHeader(rawBody, otherSigningToken), "X-Gitlab-Token": secret })).status,
            ).toBe(401);
            expect(await db.select().from(repositoryTable)).toHaveLength(0);
            expect(maintainerCheck).not.toHaveBeenCalled();
            expect(createProjectToken).not.toHaveBeenCalled();
        });
        it("keeps the existing maintainer requirement", async () => {
            await accessService.updateById(1, { ...defaultConfig, defaultWebhookSigningToken: signingToken });
            maintainerCheck.mockResolvedValue(false);
            expect((await deliver(signatureHeader())).status).toBe(404);
            expect(createProjectToken).not.toHaveBeenCalled();
        });
        it("rejects missing and malformed default credentials", async () => {
            expect((await request("/access/1", "PUT", defaultConfig)).status).toBe(400);
            expect(
                (await request("/access/1", "PUT", { ...defaultConfig, defaultWebhookSigningToken: "invalid" })).status,
            ).toBe(400);
        });
        it("keeps Forgejo default secret validation", async () => {
            await db.update(gitProviderAccessTable).set({ provider: "forgejo" });
            expect(
                (await request("/access/1", "PUT", { ...defaultConfig, defaultWebhookSigningToken: signingToken }))
                    .status,
            ).toBe(400);
            expect((await request("/access/1", "PUT", { ...defaultConfig, defaultWebhookSecret: secret })).status).toBe(
                200,
            );
            expect(accessService.hasAutoCreateDefaultConfig(await accessService.findByIdRaw(1))).toBe(true);
        });
    });

    it("preserves Forgejo webhook verification", async () => {
        await db.update(gitProviderAccessTable).set({ provider: "forgejo" });
        await service.create({ ...repositoryInput, provider: "forgejo", webhookSecret: secret });
        const body = JSON.stringify({ repository: { id: 100, full_name: "group/repo" } });
        const signature = createHmac("sha256", secret).update(body).digest("hex");
        const response = await app.request("/webhook/forgejo", {
            method: "POST",
            body,
            headers: { "X-Forgejo-Signature": signature },
        });
        expect(response.status).toBe(200);
    });

    it("preserves GitHub webhook verification without a repository secret", async () => {
        await db
            .insert(githubAppTable)
            .values({ id: 1, appId: 1, slug: "test", privateKey: encrypt("private"), webhookSecret: encrypt(secret) });
        await db.insert(githubInstallationTable).values({ id: 1, installationId: 50, appId: 1 });
        await service.create({
            path: "group/repo",
            provider: "github",
            githubRepositoryId: 100,
            githubInstallationId: 1,
            modelProviderId: 1,
        });
        const body = JSON.stringify({ repository: { id: 100 }, installation: { id: 50 } });
        const signature = createHmac("sha256", secret).update(body).digest("hex");
        const response = await app.request("/webhook/github", {
            method: "POST",
            body,
            headers: { "X-Hub-Signature-256": `sha256=${signature}` },
        });
        expect(response.status).toBe(200);
    });
}
