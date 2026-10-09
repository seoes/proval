import { afterAll, afterEach, describe, expect, it, spyOn } from "bun:test";
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, relative, sep } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type { SenderSDKConfig } from "../../agent/llm/factory.js";

if (process.env.PROVAL_XAI_TEST_CHILD !== "1") {
    it("passes xAI OAuth integration in an isolated process", () => {
        const result = Bun.spawnSync([process.execPath, "test", import.meta.path], {
            env: { ...process.env, PROVAL_XAI_TEST_CHILD: "1", DB_FILE_NAME: ":memory:" },
            stdout: "pipe",
            stderr: "pipe",
        });
        if (result.exitCode !== 0) throw new Error(result.stdout.toString() + result.stderr.toString());
        expect(result.exitCode).toBe(0);
    }, 30000);
} else {
    process.env.DB_FILE_NAME = ":memory:";
    process.env.ENCRYPTION_KEY = Buffer.alloc(32, 11).toString("base64");
    const { migrate } = await import("drizzle-orm/bun-sqlite/migrator");
    const { eq } = await import("drizzle-orm");
    const { Hono } = await import("hono");
    const { default: db } = await import("../../db/index.js");
    const { modelProviderTable, repositoryTable } = await import("@proval/db");
    const { encrypt, decrypt } = await import("../../util/encrypt.js");
    const { XaiOAuthService, xaiOAuthService } = await import("./xai-oauth.service.js");
    const { createXaiFetch, xaiBaseUrl } = await import("../../agent/llm/xai.js");
    const { ModelProviderService, createModelProviderSender } = await import("./model.service.js");
    const controller = await import("./model.controller.js");
    const { RepositoryService } = await import("../repository/repository.service.js");
    const migrationPath = resolve(import.meta.dir, "../../../../../packages/db/src/migration");
    const temporaryPath = mkdtempSync(join(tmpdir(), "proval-xai-"));
    afterAll(() => {
        const name = relative(resolve(tmpdir()), resolve(temporaryPath));
        if (!name.startsWith("proval-xai-") || name.includes(sep)) throw new Error("Unexpected test directory");
        rmSync(temporaryPath, { recursive: true, force: true });
    });
    const previousMigrationPath = join(temporaryPath, "migration");
    cpSync(migrationPath, previousMigrationPath, { recursive: true });
    const journalPath = join(previousMigrationPath, "meta/_journal.json");
    const journal = JSON.parse(readFileSync(journalPath, "utf8"));
    journal.entries = journal.entries.filter((entry: { idx: number }) => entry.idx < 46);
    writeFileSync(journalPath, JSON.stringify(journal));
    migrate(db, { migrationsFolder: previousMigrationPath });
    const legacyKey = encrypt("legacy key");
    db.$client.run(
        "INSERT INTO model_provider (id, provider, label, base_url, api_key) VALUES (1, 'openai', 'Legacy', 'https://llm.example', ?)",
        [legacyKey],
    );
    db.$client.run(
        "INSERT INTO repository (id, path, provider, model_provider_id) VALUES (1, 'team/repo', 'github', 1)",
    );
    db.$client.run(
        "INSERT INTO git_provider_access (id, provider, name, base_url, access_token, default_model_provider_id) VALUES (1, 'gitlab', 'Legacy', 'https://git.example', 'encrypted', 1)",
    );
    db.$client.run(
        "INSERT INTO activity (repository_id, repository_path, provider, model_provider_id, model_name, type, status, target_iid) VALUES (1, 'team/repo', 'github', 1, 'test', 'pr_review', 'completed', 1)",
    );
    db.$client.run("PRAGMA foreign_keys = OFF");
    migrate(db, { migrationsFolder: migrationPath });
    db.$client.run("PRAGMA foreign_keys = ON");

    const clientId = "b1a00492-073a-47ea-816f-4c329264a828";
    const input = { label: "Subscription", timeoutSecond: 30 };
    const device = {
        device_code: "private-device-code",
        user_code: "TEST-CODE",
        expires_in: 1800,
        interval: 3,
        verification_uri: "https://accounts.x.ai/oauth2/device",
        verification_uri_complete: "https://accounts.x.ai/oauth2/device?user_code=TEST-CODE",
    };
    const token = {
        access_token: "access-private",
        refresh_token: "refresh-private",
        expires_in: 3600,
        token_type: "Bearer",
    };
    const fastWait = (_ms: number, signal: AbortSignal) => delay(1, undefined, { signal });
    const api = new Hono();
    api.post("/model-provider", controller.createModelProvider);
    api.get("/model-provider/:id", controller.findModelProviderById);
    api.put("/model-provider/:id", controller.updateModelProvider);
    api.patch("/model-provider/:id/api-key", controller.updateModelProviderApiKey);
    api.post("/oauth", controller.startXaiOAuth);
    api.get("/oauth/:attemptId", controller.getXaiOAuth);
    api.delete("/oauth/:attemptId", controller.cancelXaiOAuth);
    let fetchSpy: ReturnType<typeof spyOn<typeof globalThis, "fetch">> | undefined;
    afterEach(() => {
        fetchSpy?.mockRestore();
        fetchSpy = undefined;
    });

    async function completed(service: InstanceType<typeof XaiOAuthService>, id: string, owner = "browser") {
        for (let count = 0; count < 200; count++) {
            const state = service.get(owner, id);
            if (state.status !== "pending") return state;
            await delay(2);
        }
        throw new Error("Authorization did not settle");
    }

    function saved(expired = false) {
        const credential = {
            clientId,
            accessToken: "old-access",
            refreshToken: "old-refresh",
            expiresAt: Date.now() + (expired ? -1 : 3600000),
        };
        return db
            .insert(modelProviderTable)
            .values({
                ...input,
                provider: "openai_responses",
                baseUrl: xaiBaseUrl,
                authMethod: "xai_oauth",
                oauthStatus: "authorized",
                oauthCredential: encrypt(JSON.stringify(credential)),
            })
            .returning()
            .get();
    }

    async function write(path: string, body: unknown, method = "POST") {
        return api.request(path, {
            method,
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
        });
    }

    describe("xAI device authorization", () => {
        it("upgrades an existing API Key database without losing any association", () => {
            const row = db.select().from(modelProviderTable).where(eq(modelProviderTable.id, 1)).get()!;
            expect(row).toMatchObject({
                authMethod: "api_key",
                oauthStatus: null,
                oauthCredential: null,
                apiKey: legacyKey,
            });
            expect(decrypt(row.apiKey!)).toBe("legacy key");
            for (const [table, field] of [
                ["repository", "model_provider_id"],
                ["activity", "model_provider_id"],
                ["git_provider_access", "default_model_provider_id"],
            ]) {
                expect(db.$client.query(`SELECT ${field} AS id FROM ${table}`).get()).toEqual({ id: 1 });
            }
            expect(db.$client.query("PRAGMA foreign_key_check").all()).toEqual([]);
        });

        it("honors pending and slow down and saves exactly one encrypted provider", async () => {
            const waitList: number[] = [];
            let pollCount = 0;
            const service = new XaiOAuthService(
                async (url, init) => {
                    const form = new URLSearchParams(String(init?.body));
                    expect(new Headers(init?.headers).get("user-agent")).toBe("Proval");
                    expect(form.get("client_id")).toBe(clientId);
                    if (String(url).endsWith("device/code")) {
                        expect(form.get("scope")).toBe(
                            "openid profile email offline_access grok-cli:access api:access",
                        );
                        expect(form.get("referrer")).toBe("proval");
                        return Response.json(device);
                    }
                    expect(form.get("device_code")).toBe(device.device_code);
                    expect(form.get("grant_type")).toBe("urn:ietf:params:oauth:grant-type:device_code");
                    pollCount++;
                    if (pollCount < 3)
                        return Response.json(
                            { error: pollCount === 1 ? "authorization_pending" : "slow_down" },
                            { status: 400 },
                        );
                    return Response.json(token);
                },
                async (ms, signal) => {
                    waitList.push(ms);
                    await fastWait(ms, signal);
                },
            );
            const start = await service.start("browser", input);
            expect(JSON.stringify(start)).not.toContain(device.device_code);
            expect(() => service.get("someone else", start.id)).toThrow("not found");
            const result = await completed(service, start.id);
            expect(result.status).toBe("authorized");
            expect(waitList).toEqual([3000, 3000, 8000]);
            expect(service.get("browser", start.id).modelProviderId).toBe(result.modelProviderId);
            const row = await new ModelProviderService().findById(result.modelProviderId!);
            expect(row.apiKey).toBeNull();
            expect(row.oauthCredential).not.toContain(token.access_token);
            expect(JSON.parse(decrypt(row.oauthCredential!))).toMatchObject({
                accessToken: token.access_token,
                refreshToken: token.refresh_token,
                clientId,
            });
            const publicData = new ModelProviderService().toResponse(row);
            expect(publicData).not.toHaveProperty("oauthCredential");
            expect(publicData).not.toHaveProperty("apiKey");
            expect(service.cancel("browser", start.id).status).toBe("authorized");
        });

        it.each(["access_denied", "expired_token", "invalid_client"])(
            "terminates on %s without creating a provider",
            async (error) => {
                const before = db.select().from(modelProviderTable).all().length;
                const service = new XaiOAuthService(
                    async (url) =>
                        Response.json(String(url).endsWith("device/code") ? device : { error }, {
                            status: String(url).endsWith("device/code") ? 200 : 400,
                        }),
                    fastWait,
                );
                const start = await service.start("browser", input);
                expect((await completed(service, start.id)).status).toBe(
                    error === "access_denied" ? "denied" : error === "expired_token" ? "expired" : "failed",
                );
                expect(db.select().from(modelProviderTable).all().length).toBe(before);
            },
        );

        it("cancels and expires pending attempts without exchanging another token", async () => {
            let pollCount = 0;
            const service = new XaiOAuthService(async (url) => {
                if (!String(url).endsWith("device/code")) pollCount++;
                return Response.json({ ...device, expires_in: 0.02 });
            });
            const cancelled = await service.start("browser", input);
            expect(service.cancel("browser", cancelled.id).status).toBe("cancelled");
            const expired = await service.start("browser", input);
            expect((await completed(service, expired.id)).status).toBe("expired");
            expect(pollCount).toBe(0);
        });

        it("rejects token injection and restricts OAuth edits", async () => {
            const row = saved();
            for (const body of [
                { oauthCredential: "injected" },
                { authMethod: "api_key" },
                { baseUrl: "https://evil.example" },
                { provider: "openai" },
            ]) {
                expect((await write(`/model-provider/${row.id}`, body, "PUT")).status).toBe(400);
            }
            expect(
                (
                    await write("/model-provider", {
                        provider: "openai",
                        label: "test",
                        baseUrl: xaiBaseUrl,
                        apiKey: "key",
                        oauthCredential: "injected",
                    })
                ).status,
            ).toBe(400);
            expect((await write(`/model-provider/${row.id}/api-key`, { value: "key" }, "PATCH")).status).toBe(400);
            const response = await write(`/model-provider/${row.id}`, { label: "Renamed", timeoutSecond: 45 }, "PUT");
            expect(response.status).toBe(200);
            expect(await response.json()).toMatchObject({ label: "Renamed", timeoutSecond: 45 });
        });

        it("binds attempts to a browser even when Proval login is disabled", async () => {
            fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(Response.json(device));
            const response = await api.request("/oauth", {
                method: "POST",
                headers: { "content-type": "application/json", "X-Proval-OAuth": "1" },
                body: JSON.stringify(input),
            });
            expect(response.status).toBe(201);
            const body = await response.json();
            const cookie = response.headers.get("set-cookie")!.split(";")[0];
            expect(response.headers.get("set-cookie")).toContain("HttpOnly");
            expect(response.headers.get("cache-control")).toBe("no-store");
            expect((await api.request(`/oauth/${body.id}`, { headers: { "X-Proval-OAuth": "1" } })).status).toBe(404);
            expect(
                (
                    await api.request(`/oauth/${body.id}`, {
                        headers: { cookie, "X-Proval-OAuth": "1", "Sec-Fetch-Site": "cross-site" },
                    })
                ).status,
            ).toBe(403);
            expect((await api.request(`/oauth/${body.id}`, { headers: { cookie } })).status).toBe(403);
            const cancel = await api.request(`/oauth/${body.id}`, {
                method: "DELETE",
                headers: { cookie, "X-Proval-OAuth": "1" },
            });
            expect((await cancel.json()).status).toBe("cancelled");
        });
    });

    describe("xAI credential lifecycle", () => {
        it("shares a concurrent refresh and persists rotation for a new service instance", async () => {
            const row = saved(true);
            let refreshCount = 0;
            const service = new XaiOAuthService(async (_url, init) => {
                refreshCount++;
                expect(new URLSearchParams(String(init?.body)).get("refresh_token")).toBe("old-refresh");
                await delay(5);
                return Response.json(token);
            });
            const result = await Promise.all(Array.from({ length: 12 }, () => service.getAccessToken(row.id)));
            expect(refreshCount).toBe(1);
            expect(result.every((item) => item === token.access_token)).toBe(true);
            const restarted = new XaiOAuthService(async () => {
                throw new Error("Should use persisted token");
            });
            expect(await restarted.getAccessToken(row.id)).toBe(token.access_token);
            const stored = await new ModelProviderService().findById(row.id);
            if (!stored.oauthCredential) throw new Error("Saved credential is missing");
            expect(JSON.parse(decrypt(stored.oauthCredential)).refreshToken).toBe(token.refresh_token);
        });

        it("retains the previous refresh token when rotation omits it", async () => {
            const row = saved(true);
            const service = new XaiOAuthService(async () =>
                Response.json({ access_token: "updated", expires_in: 3600 }),
            );
            expect(await service.getAccessToken(row.id)).toBe("updated");
            const stored = await new ModelProviderService().findById(row.id);
            if (!stored.oauthCredential) throw new Error("Saved credential is missing");
            expect(JSON.parse(decrypt(stored.oauthCredential)).refreshToken).toBe("old-refresh");
        });

        it.each([400, 503])("handles refresh failure %s without leaking upstream details", async (status) => {
            const row = saved(true);
            const service = new XaiOAuthService(async () =>
                Response.json(
                    {
                        error: status === 400 ? "invalid_grant" : "server_error",
                        error_description: token.refresh_token,
                    },
                    { status },
                ),
            );
            await expect(service.getAccessToken(row.id)).rejects.toThrow(
                status === 400 ? "Reconnect" : "Try again later",
            );
            const stored = await new ModelProviderService().findById(row.id);
            expect(stored.oauthStatus).toBe(status === 400 ? "reauthorization_required" : "authorized");
            expect(stored.oauthCredential).toBe(row.oauthCredential);
        });

        it("does not overwrite a new authorization or resurrect a deleted provider", async () => {
            for (const remove of [false, true]) {
                const row = saved(true);
                let release!: () => void;
                const gate = new Promise<void>((resolve) => {
                    release = resolve;
                });
                const service = new XaiOAuthService(async () => {
                    await gate;
                    return Response.json(token);
                });
                const refreshing = service.getAccessToken(row.id);
                const replacement = encrypt(
                    JSON.stringify({
                        clientId,
                        accessToken: "reconnected",
                        refreshToken: "new-grant",
                        expiresAt: Date.now() + 3600000,
                    }),
                );
                if (remove) db.delete(modelProviderTable).where(eq(modelProviderTable.id, row.id)).run();
                else
                    db.update(modelProviderTable)
                        .set({ oauthCredential: replacement })
                        .where(eq(modelProviderTable.id, row.id))
                        .run();
                release();
                if (remove) await expect(refreshing).rejects.toThrow("not found");
                else {
                    expect(await refreshing).toBe("reconnected");
                    expect((await new ModelProviderService().findById(row.id)).oauthCredential).toBe(replacement);
                }
            }
        });

        it("reauthorizes the same provider and preserves repository association", async () => {
            const row = saved();
            const repository = db
                .insert(repositoryTable)
                .values({ provider: "github", path: "team/oauth", modelProviderId: row.id })
                .returning()
                .get();
            const service = new XaiOAuthService(
                async (url) => Response.json(String(url).endsWith("device/code") ? device : token),
                fastWait,
            );
            const start = await service.start("browser", { ...input, modelProviderId: row.id });
            expect((await completed(service, start.id)).modelProviderId).toBe(row.id);
            expect(
                db.select().from(repositoryTable).where(eq(repositoryTable.id, repository.id)).get()?.modelProviderId,
            ).toBe(row.id);
            await expect(new ModelProviderService().remove(row.id)).rejects.toThrow("repositories");
            const updated = await new RepositoryService().update(repository.id, { reasoningEffort: "none" });
            expect(updated.reasoningEffort).toBe("none");
        });

        it("saves repository reasoning without a provider specific restriction", async () => {
            const row = saved();
            const service = new RepositoryService();
            const repository = await service.create({
                provider: "github",
                path: "team/reasoning-default",
                modelProviderId: row.id,
                reasoningEffort: "none",
            });
            expect(repository.reasoningEffort).toBe("none");
            expect(repository.modelProviderId).toBe(row.id);
            const updated = await service.update(repository.id, { reasoningEffort: "minimal" });
            expect(updated.reasoningEffort).toBe("minimal");
        });

        it("refreshes once on 401 and never forwards a bearer token to another host", async () => {
            const row = saved();
            const bearerList: string[] = [];
            let refreshCount = 0;
            const fetch: SenderSDKConfig["fetch"] = async (url, init) => {
                if (String(url).includes("auth.x.ai")) {
                    refreshCount++;
                    return Response.json(token);
                }
                bearerList.push(new Headers(init?.headers).get("authorization")!);
                expect(init?.redirect).toBe("error");
                return new Response("Denied", { status: 401 });
            };
            const service = new XaiOAuthService(fetch);
            const request = createXaiFetch({
                getAccessToken: (rejected) => service.getAccessToken(row.id, rejected),
                fetch,
            });
            expect((await request(`${xaiBaseUrl}/responses`, { method: "POST", body: "{}" })).status).toBe(401);
            expect(refreshCount).toBe(1);
            expect(bearerList).toEqual(["Bearer old-access", `Bearer ${token.access_token}`]);
            await expect(request("https://evil.example/v1/responses")).rejects.toThrow("another address");
            await expect(request("https://api.x.ai@evil.example/v1/responses")).rejects.toThrow("another address");
            expect(bearerList).toHaveLength(2);
        });

        it("respects cancellation while a shared refresh is pending", async () => {
            const row = saved(true);
            let release!: () => void;
            const gate = new Promise<void>((resolve) => {
                release = resolve;
            });
            const service = new XaiOAuthService(async () => {
                await gate;
                return Response.json(token);
            });
            const abort = new AbortController();
            const request = createXaiFetch({
                getAccessToken: (rejected) => service.getAccessToken(row.id, rejected),
                fetch: async () => {
                    throw new Error("A cancelled request must not be sent");
                },
            })(`${xaiBaseUrl}/responses`, { signal: abort.signal });
            const survivor = service.getAccessToken(row.id);
            abort.abort(new Error("Request deadline"));
            await expect(request).rejects.toThrow("Request deadline");
            release();
            expect(await survivor).toBe(token.access_token);
        });

        it("does not refresh on permission or quota errors and surfaces reconnect instructions", async () => {
            const row = saved();
            let count = 0;
            const fetch: SenderSDKConfig["fetch"] = async () => {
                count++;
                return Response.json({ error: "quota_exceeded" }, { status: 403 });
            };
            const service = new XaiOAuthService(fetch);
            const request = createXaiFetch({
                getAccessToken: (rejected) => service.getAccessToken(row.id, rejected),
                fetch,
            });
            expect((await request(`${xaiBaseUrl}/responses`)).status).toBe(403);
            expect(count).toBe(1);
            db.update(modelProviderTable)
                .set({ oauthStatus: "reauthorization_required" })
                .where(eq(modelProviderTable.id, row.id))
                .run();
            await expect(
                createModelProviderSender(row, "grok-test").send([{ role: "user", content: "Hi" }], []),
            ).rejects.toThrow("Reconnect");
        });

        it("allows pending reauthorization to complete after the old credential refreshes", async () => {
            const row = saved(true);
            let approve = false;
            const service = new XaiOAuthService(async (url, init) => {
                if (String(url).endsWith("device/code")) return Response.json(device);
                if (new URLSearchParams(String(init?.body)).get("grant_type") === "refresh_token")
                    return Response.json(token);
                return approve
                    ? Response.json({ ...token, access_token: "reconnected" })
                    : Response.json({ error: "authorization_pending" }, { status: 400 });
            }, fastWait);
            const start = await service.start("browser", { ...input, modelProviderId: row.id });
            await service.getAccessToken(row.id);
            approve = true;
            expect((await completed(service, start.id)).status).toBe("authorized");
            expect(await service.getAccessToken(row.id)).toBe("reconnected");
        });

        it("removes local credentials even if upstream revocation fails", async () => {
            const row = saved();
            let revoked = "";
            fetchSpy = spyOn(globalThis, "fetch").mockImplementation((async (
                url: RequestInfo | URL,
                init?: RequestInit,
            ): Promise<Response> => {
                expect(String(url)).toBe("https://auth.x.ai/oauth2/revoke");
                revoked = new URLSearchParams(String(init?.body)).get("token")!;
                throw new Error("Network unavailable");
            }) as typeof fetch);
            await new ModelProviderService().remove(row.id);
            expect(revoked).toBe("old-refresh");
            await expect(new ModelProviderService().findById(row.id)).rejects.toThrow("not found");
        });

        it("uses saved OAuth for model discovery and a Responses tool round trip", async () => {
            const row = saved();
            let responseCount = 0;
            const reasoning = { type: "reasoning", id: "reasoning_1", summary: [], encrypted_content: "opaque" };
            const tool = { type: "function_call", id: "item_1", call_id: "call_1", name: "echo", arguments: "{}" };
            fetchSpy = spyOn(globalThis, "fetch").mockImplementation((async (
                url: RequestInfo | URL,
                init?: RequestInit,
            ): Promise<Response> => {
                expect(new Headers(init?.headers).get("authorization")).toBe("Bearer old-access");
                if (String(url).endsWith("/models")) return Response.json({ data: [{ id: "grok-test" }] });
                expect(String(url)).toBe(`${xaiBaseUrl}/responses`);
                const body = JSON.parse(String(init?.body));
                expect(body.store).toBe(false);
                responseCount++;
                if (responseCount <= 3) expect(body).not.toHaveProperty("reasoning");
                else expect(body.reasoning).toEqual({ effort: "high" });
                if (responseCount === 2) {
                    expect(body.input).toContainEqual(reasoning);
                    expect(body.input).toContainEqual(tool);
                    expect(body.input).toContainEqual({
                        type: "function_call_output",
                        call_id: "call_1",
                        output: "OK",
                    });
                }
                const event = {
                    type: "response.completed",
                    response: {
                        id: "resp_test",
                        status: "completed",
                        output:
                            responseCount === 1
                                ? [reasoning, tool]
                                : [
                                      {
                                          type: "message",
                                          id: "msg_1",
                                          role: "assistant",
                                          status: "completed",
                                          content: [{ type: "output_text", text: "OK", annotations: [] }],
                                      },
                                  ],
                        usage: { input_tokens: 10, output_tokens: 2 },
                    },
                };
                return new Response(`event: response.completed\ndata: ${JSON.stringify(event)}\n\n`, {
                    headers: { "content-type": "text/event-stream" },
                });
            }) as typeof fetch);
            expect(await new ModelProviderService().listModels(row.id)).toMatchObject({
                models: [{ id: "grok-test" }],
            });
            const sender = createModelProviderSender(row, "grok-test", "none");
            const first = await sender.send(
                [{ role: "user", content: "Call echo" }],
                [
                    {
                        name: "echo",
                        description: "Echo",
                        parameters: { type: "object", properties: {} },
                        execute: async () => "OK",
                    },
                ],
            );
            expect(first.message.toolCalls?.[0]?.id).toBe("call_1");
            const second = await sender.send(
                [first.message, { role: "tool", content: "OK", toolCallId: "call_1" }],
                [],
            );
            expect(second.message.content).toBe("OK");
            await new ModelProviderService().verifySaved(row.id, "grok-test");
            expect(responseCount).toBe(3);
            await createModelProviderSender(row, "grok-test", "high").send([{ role: "user", content: "Hi" }], []);
            expect(responseCount).toBe(4);
            expect(() => createModelProviderSender(row, "grok-test", "minimal")).toThrow("not supported by xAI");
            // Ensure singleton state also uses the persisted credential after request completion.
            expect(await xaiOAuthService.getAccessToken(row.id)).toBe("old-access");
        });
    });
}
