import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { resolve } from "node:path";
import type { ModelProviderResponse } from "@proval/types";

if (process.env.PROVAL_MODEL_TEST_CHILD !== "1") {
    it("passes model provider integration in an isolated process", () => {
        const result = Bun.spawnSync([process.execPath, "test", import.meta.path], {
            env: { ...process.env, PROVAL_MODEL_TEST_CHILD: "1", DB_FILE_NAME: ":memory:" },
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
    process.env.ENCRYPTION_KEY = Buffer.alloc(32, 1).toString("base64");
    const { Hono } = await import("hono");
    const { migrate } = await import("drizzle-orm/bun-sqlite/migrator");
    const { default: db } = await import("../../db/index.js");
    const { createSender } = await import("../../agent/llm/factory.js");
    const { ModelProviderService, createModelProviderSender } = await import("./model.service.js");
    const {
        createModelProvider,
        updateModelProvider,
        findModelProviderById,
        listModelProviderModels,
        verifyModelProviderConfig,
    } = await import("./model.controller.js");

    migrate(db, { migrationsFolder: resolve(import.meta.dir, "../../../../../packages/db/src/migration") });
    const app = new Hono();
    app.post("/model-provider", createModelProvider);
    app.post("/model-provider/verify", verifyModelProviderConfig);
    app.get("/model-provider/:id", findModelProviderById);
    app.put("/model-provider/:id", updateModelProvider);
    app.get("/model-provider/:id/models", listModelProviderModels);
    const config = {
        provider: "openai_responses",
        label: "Responses test",
        baseUrl: "https://llm.example/v1",
        apiKey: "test-key",
        timeoutSecond: 30,
    };
    const requestList: { url: string; body: Record<string, unknown>; timeoutSecond: string | null }[] = [];
    let failResponse = false;
    let incompleteReason: "max_output_tokens" | "content_filter" | undefined;
    let server: ReturnType<typeof Bun.serve>;
    let logSpy: ReturnType<typeof spyOn<typeof console, "log">>;

    beforeEach(() => {
        requestList.length = 0;
        failResponse = false;
        incompleteReason = undefined;
        logSpy = spyOn(console, "log").mockImplementation(() => {});
        server = Bun.serve({
            hostname: "127.0.0.1",
            port: 0,
            async fetch(request) {
                const url = request.url;
                requestList.push({
                    url,
                    body: request.method === "POST" ? ((await request.json()) as Record<string, unknown>) : {},
                    timeoutSecond: request.headers.get("x-stainless-timeout"),
                });
                if (url.endsWith("/responses")) {
                    const event = failResponse
                        ? {
                              type: "response.failed",
                              response: {
                                  status: "failed",
                                  error: { code: "invalid_prompt", message: "Model unavailable" },
                              },
                          }
                        : {
                              type: incompleteReason ? "response.incomplete" : "response.completed",
                              response: {
                                  id: "resp_test",
                                  status: incompleteReason ? "incomplete" : "completed",
                                  incomplete_details: incompleteReason ? { reason: incompleteReason } : null,
                                  output: incompleteReason
                                      ? []
                                      : [
                                            {
                                                type: "message",
                                                id: "msg_test",
                                                role: "assistant",
                                                status: "completed",
                                                content: [{ type: "output_text", text: "OK", annotations: [] }],
                                            },
                                        ],
                                  usage: {
                                      input_tokens: 10,
                                      output_tokens: 2,
                                      input_tokens_details: { cached_tokens: 5 },
                                  },
                              },
                          };
                    return new Response(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`, {
                        headers: { "content-type": "text/event-stream" },
                    });
                }
                if (url.endsWith("/chat/completions")) {
                    return Response.json({
                        id: "chat_test",
                        choices: [{ message: { role: "assistant", content: "OK" }, finish_reason: "stop" }],
                    });
                }
                if (url.endsWith("/messages")) {
                    return Response.json({
                        id: "msg_test",
                        content: [{ type: "text", text: "OK" }],
                        stop_reason: "end_turn",
                        usage: { input_tokens: 10, output_tokens: 2 },
                    });
                }
                if (url.endsWith("/models")) {
                    return Response.json({ object: "list", data: [{ id: "test-model" }] });
                }
                throw new Error(`Unexpected test request ${url}`);
            },
        });
        config.baseUrl = `${server.url}v1`;
    });

    afterEach(() => {
        server.stop(true);
        logSpy.mockRestore();
    });

    async function writeConfig(path: string, body: Record<string, unknown>, method = "POST") {
        return app.request(path, {
            method,
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
        });
    }

    describe("Responses provider integration", () => {
        it("persists the selection and uses Responses for a saved provider", async () => {
            const created = await writeConfig("/model-provider", config);
            expect(created.status).toBe(201);
            const provider = (await created.json()) as ModelProviderResponse;
            expect(provider.provider).toBe("openai_responses");
            expect(provider).not.toHaveProperty("apiKey");

            const loaded = await app.request(`/model-provider/${provider.id}`);
            expect(await loaded.json()).toMatchObject({ provider: "openai_responses", timeoutSecond: 30 });
            const stored = await new ModelProviderService().findById(provider.id);
            const sender = createModelProviderSender(stored, "test-model", "high");
            const response = await sender.send([{ role: "user", content: "Review" }], []);
            expect(response.message.content).toBe("OK");
            expect(response.usage).toEqual({ inputToken: 10, outputToken: 2, cachedInputToken: 5 });
            expect(sender.getModel().provider).toBe("openai_responses");
            expect(requestList[0]).toMatchObject({
                url: `${config.baseUrl}/responses`,
                body: { model: "test-model", store: false, stream: true, reasoning: { effort: "high" } },
            });
            expect(requestList[0].body).not.toHaveProperty("max_output_tokens");

            const modelList = await app.request(`/model-provider/${provider.id}/models`);
            expect(await modelList.json()).toEqual({ models: [{ id: "test-model" }], source: "openai_compatible" });
        });

        it("allows changing an existing provider to Responses", async () => {
            const created = await writeConfig("/model-provider", { ...config, provider: "openai" });
            const provider = (await created.json()) as ModelProviderResponse;
            const updated = await writeConfig(
                `/model-provider/${provider.id}`,
                { provider: "openai_responses" },
                "PUT",
            );
            expect(updated.status).toBe(200);
            const loaded = await app.request(`/model-provider/${provider.id}`);
            expect(await loaded.json()).toMatchObject({ provider: "openai_responses" });
        });

        it("verifies Responses with the configured timeout and an output limit of one", async () => {
            const response = await writeConfig("/model-provider/verify", { ...config, modelName: "test-model" });
            expect(response.status).toBe(200);
            expect(await response.json()).toMatchObject({ success: true });
            expect(requestList).toHaveLength(1);
            expect(requestList[0]).toMatchObject({
                url: `${config.baseUrl}/responses`,
                body: { model: "test-model", stream: true, max_output_tokens: 1 },
                timeoutSecond: "30",
            });
        });

        it("accepts verification truncated by the Responses output limit", async () => {
            incompleteReason = "max_output_tokens";
            const response = await writeConfig("/model-provider/verify", { ...config, modelName: "test-model" });
            expect(response.status).toBe(200);
            expect(await response.json()).toMatchObject({ success: true });
        });

        it("rejects Responses verification truncated by content filtering", async () => {
            incompleteReason = "content_filter";
            const response = await writeConfig("/model-provider/verify", { ...config, modelName: "test-model" });
            expect(response.status).toBe(401);
            expect(await response.json()).toEqual({
                success: false,
                message: "OpenAI Responses generation incomplete (content_filter)",
            });
        });

        it("still rejects truncated Responses when no output limit was configured", async () => {
            incompleteReason = "max_output_tokens";
            const sender = createSender({
                ...config,
                provider: "openai_responses",
                baseURL: config.baseUrl,
                model: "test-model",
            });
            await expect(sender.send([{ role: "user", content: "Hello" }], [])).rejects.toThrow(
                "OpenAI Responses generation incomplete (max_output_tokens)",
            );
        });

        it("does not report success when streamed verification fails", async () => {
            failResponse = true;
            const response = await writeConfig("/model-provider/verify", { ...config, modelName: "test-model" });
            expect(response.status).toBe(401);
            expect(await response.json()).toEqual({ success: false, message: "Model unavailable" });
        });

        it("rejects an invalid verification timeout before making a request", async () => {
            const response = await writeConfig("/model-provider/verify", {
                ...config,
                modelName: "test-model",
                timeoutSecond: 0,
            });
            expect(response.status).toBe(400);
            expect(requestList).toHaveLength(0);
        });

        it.each([
            ["openai", "/chat/completions"],
            ["anthropic", "/messages"],
        ] as const)("keeps the existing %s provider on its endpoint", async (provider, endpoint) => {
            const baseUrl = provider === "anthropic" ? String(server.url).replace(/\/$/, "") : config.baseUrl;
            const sender = createSender({ ...config, provider, baseURL: baseUrl, model: "test-model" });
            expect((await sender.send([{ role: "user", content: "Hello" }], [])).message.content).toBe("OK");
            expect(requestList[0].url).toBe(`${config.baseUrl}${endpoint}`);
            if (provider === "anthropic") {
                expect(requestList[0].body.max_tokens).toBe(8192);
            } else {
                expect(requestList[0].body).not.toHaveProperty("max_tokens");
            }

            const response = await writeConfig("/model-provider/verify", {
                ...config,
                provider,
                baseUrl,
                modelName: "test-model",
            });
            expect(response.status).toBe(200);
            expect(requestList[1]).toMatchObject({
                url: `${config.baseUrl}${endpoint}`,
                body: { model: "test-model", max_tokens: 1 },
                timeoutSecond: "30",
            });
        });
    });
}
