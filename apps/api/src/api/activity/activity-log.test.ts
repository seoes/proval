import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import { resolve } from "node:path";
import type { ActivityLogEntry, ActivityLogResponse } from "@proval/types";
import type { AgentTool, LlmSender, ToolCall } from "../../agent/llm/loop.js";

// Isolate the real database and logger from module mocks in other test files
if (process.env.PROVAL_ACTIVITY_LOG_TEST_CHILD !== "1") {
    it("passes activity log integration in an isolated process", () => {
        const result = Bun.spawnSync([process.execPath, "test", import.meta.path], {
            env: { ...process.env, PROVAL_ACTIVITY_LOG_TEST_CHILD: "1", DB_FILE_NAME: ":memory:" },
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
    const { Hono } = await import("hono");
    const { migrate } = await import("drizzle-orm/bun-sqlite/migrator");
    const { eq } = await import("drizzle-orm");
    const { activityTable, repositoryTable, modelProviderTable } = await import("@proval/db");
    const { default: db } = await import("../../db/index.js");
    const { logAgent, logAgentError } = await import("../../util/log.js");
    const { ActivityService } = await import("./activity.service.js");
    const { findActivityLogById, findActivityStatusById } = await import("./activity.controller.js");
    const { runAgentLoop } = await import("../../agent/llm/loop.js");
    const { wrapUntrustedToolContent } = await import("../../agent/shared/prompt/untrusted-warning.prompt.js");

    migrate(db, { migrationsFolder: resolve(import.meta.dir, "../../../../../packages/db/src/migration") });
    const service = new ActivityService();
    const app = new Hono();
    app.get("/activity/:id/log", findActivityLogById);
    app.get("/activity/:id/status", findActivityStatusById);
    let activityId: number;
    let consoleLog: ReturnType<typeof spyOn>;
    let consoleError: ReturnType<typeof spyOn>;

    beforeEach(async () => {
        consoleLog = spyOn(console, "log").mockImplementation(() => {});
        consoleError = spyOn(console, "error").mockImplementation(() => {});
        const [activity] = await db
            .insert(activityTable)
            .values({
                repositoryPath: "group/repo",
                provider: "github",
                modelName: "test",
                type: "pr_review",
                status: "started",
                logVersion: "1",
                targetIid: 1,
            })
            .returning({ id: activityTable.id });
        activityId = activity.id;
    });

    afterEach(() => {
        consoleLog.mockRestore();
        consoleError.mockRestore();
    });

    function createSender(callList: ToolCall[]): LlmSender {
        let sent = false;
        return {
            getModel: () => ({ model: "test", provider: "openai", baseUrl: "http://localhost" }),
            async send() {
                const toolCalls = sent ? undefined : callList;
                sent = true;
                return {
                    message: { role: "assistant", content: "done", toolCalls },
                    finishReason: toolCalls ? "tool_calls" : "stop",
                    requestId: null,
                    usage: { inputToken: 1, cachedInputToken: 0, outputToken: 1 },
                };
            },
        };
    }

    const call = { id: "provider-call", name: "read", arguments: '{"path":"a.ts"}' };

    async function readToolLogList() {
        const response = await service.findLogListById(activityId);
        if (!response) throw new Error("Activity not found");
        return response.logs.filter((entry) => entry.type !== "common");
    }

    describe("activity log compatibility", () => {
        it("migrates old entries to common and persists them once", async () => {
            const base = {
                timestamp: new Date(0).toISOString(),
                level: "info" as const,
                message: "result from old log",
            };
            await db
                .update(activityTable)
                .set({
                    updatedAt: new Date(0),
                    logVersion: null,
                    logs: [
                        { ...base, label: "Current", step: "Old" },
                        { ...base, step: "Plan" },
                        base,
                        { ...base, type: "tool-result", toolName: "read" },
                    ],
                })
                .where(eq(activityTable.id, activityId));
            const before = db.$client
                .query("SELECT status, created_at, updated_at FROM activity WHERE id = ?")
                .get(activityId);

            const response = await app.request(`/activity/${activityId}/log`);
            expect(response.status).toBe(200);
            const body = (await response.json()) as ActivityLogResponse;
            expect(body.status).toBe("started");
            expect(body.logVersion).toBe("1");
            expect(body.logs.map((entry) => entry.label)).toEqual(["Current", "Plan", "log", "log"]);
            expect(body.logs.every((entry) => entry.type === "common" && entry.message === base.message)).toBe(true);
            const saved = db
                .select({ logs: activityTable.logs, logVersion: activityTable.logVersion })
                .from(activityTable)
                .where(eq(activityTable.id, activityId))
                .get();
            expect(saved?.logs).toEqual(body.logs);
            expect(saved?.logVersion).toBe("1");
            expect(saved?.logs.every((entry) => entry.timestamp === base.timestamp && entry.level === base.level)).toBe(
                true,
            );
            expect(saved?.logs.every((entry) => !("step" in entry) && !("toolName" in entry))).toBe(true);
            expect(
                db.$client.query("SELECT status, created_at, updated_at FROM activity WHERE id = ?").get(activityId),
            ).toEqual(before);

            const changeCount = db.$client.query("SELECT total_changes() AS count");
            const afterMigration = changeCount.get();
            const repeated = await app.request(`/activity/${activityId}/log`);
            expect(await repeated.json()).toEqual(body);
            expect(changeCount.get()).toEqual(afterMigration);
        });

        it("preserves new tool entries when migrating a mixed log list", async () => {
            const base = {
                timestamp: new Date(0).toISOString(),
                level: "info" as const,
                label: "Plan",
                message: "old entry",
            };
            const tool = { ...base, toolName: "read", toolCallId: "stored-call" };
            const toolLogList: ActivityLogEntry[] = [
                { ...tool, type: "tool-call", message: "{}" },
                { ...tool, type: "tool-result", message: "content" },
                { ...tool, type: "tool-error", level: "error", message: "failed", toolCallId: "other-call" },
            ];
            await db
                .update(activityTable)
                .set({ logs: [base, ...toolLogList], logVersion: null })
                .where(eq(activityTable.id, activityId));

            const response = await service.findLogListById(activityId);
            expect(response?.logs).toEqual([{ ...base, type: "common" }, ...toolLogList]);
            const saved = db
                .select({ logs: activityTable.logs })
                .from(activityTable)
                .where(eq(activityTable.id, activityId))
                .get();
            expect(saved?.logs).toEqual(response?.logs);
        });

        it("preserves a concurrent append and avoids duplicate migration writes", async () => {
            const base = {
                timestamp: new Date(0).toISOString(),
                level: "info" as const,
                label: "Plan",
                message: "old entry",
            };
            const appended: ActivityLogEntry = {
                ...base,
                type: "tool-call",
                toolName: "read",
                toolCallId: "concurrent-call",
                message: "{}",
            };
            await db
                .update(activityTable)
                .set({ logs: [base], logVersion: null })
                .where(eq(activityTable.id, activityId));
            const changeCount = db.$client.query<{ count: number }, []>("SELECT total_changes() AS count");
            const before = changeCount.get();

            const [first, second] = await Promise.all([
                service.findLogListById(activityId),
                service.findLogListById(activityId),
                service.appendLog(activityId, appended),
            ]);

            const expected: ActivityLogEntry[] = [{ ...base, type: "common" }, appended];
            expect(first?.logs).toEqual(expected);
            expect(second?.logs).toEqual(expected);
            const saved = db
                .select({ logs: activityTable.logs })
                .from(activityTable)
                .where(eq(activityTable.id, activityId))
                .get();
            expect(saved?.logs).toEqual(expected);
            expect(changeCount.get()?.count).toBe((before?.count ?? 0) + 2);
        });

        it("returns an empty list for a new activity and 404 for a missing activity", async () => {
            expect(await service.findLogListById(activityId)).toEqual({ status: "started", logVersion: "1", logs: [] });
            const response = await app.request("/activity/0/log");
            expect(response.status).toBe(404);
        });

        it("marks an empty legacy log list as migrated only once", async () => {
            await db.update(activityTable).set({ logVersion: null }).where(eq(activityTable.id, activityId));
            const changeCount = db.$client.query<{ count: number }, []>("SELECT total_changes() AS count");
            const before = changeCount.get();
            const first = await service.findLogListById(activityId);
            const second = await service.findLogListById(activityId);
            expect(first).toEqual({ status: "started", logVersion: "1", logs: [] });
            expect(second).toEqual(first);
            expect(changeCount.get()?.count).toBe((before?.count ?? 0) + 1);
            const saved = db
                .select({ logVersion: activityTable.logVersion })
                .from(activityTable)
                .where(eq(activityTable.id, activityId))
                .get();
            expect(saved?.logVersion).toBe("1");
        });

        it("starts a new activity with the current log version", async () => {
            const [repository] = await db
                .insert(repositoryTable)
                .values({ path: "group/new", provider: "github" })
                .returning({ id: repositoryTable.id });
            const [modelProvider] = await db
                .insert(modelProviderTable)
                .values({
                    provider: "openai",
                    label: "Test",
                    baseUrl: "http://localhost",
                    apiKey: "unused",
                })
                .returning({ id: modelProviderTable.id });
            const id = await service.start({
                repositoryId: repository.id,
                modelProviderId: modelProvider.id,
                modelName: "test",
                type: "pr_review",
                targetIid: 1,
            });
            const saved = db
                .select({ logVersion: activityTable.logVersion })
                .from(activityTable)
                .where(eq(activityTable.id, id))
                .get();
            expect(saved?.logVersion).toBe("1");
            const changeCount = db.$client.query("SELECT total_changes() AS count");
            const before = changeCount.get();
            expect(await service.findLogListById(id)).toEqual({ status: "started", logVersion: "1", logs: [] });
            expect(changeCount.get()).toEqual(before);
        });

        it("returns a status snapshot and a log tail for polling", async () => {
            const entry = {
                type: "common" as const,
                timestamp: new Date(0).toISOString(),
                level: "info" as const,
                label: "Plan",
            };
            await db
                .update(activityTable)
                .set({
                    status: "completed",
                    errorMessage: "boom",
                    inputToken: 3,
                    cachedInputToken: 1,
                    outputToken: 2,
                    completedAt: new Date(0),
                    logs: [
                        { ...entry, message: "one" },
                        { ...entry, message: "two" },
                    ],
                })
                .where(eq(activityTable.id, activityId));

            const missing = await app.request("/activity/0/status");
            expect(missing.status).toBe(404);

            const statusResponse = await app.request(`/activity/${activityId}/status`);
            expect(statusResponse.status).toBe(200);
            expect(await statusResponse.json()).toEqual({
                status: "completed",
                completedAt: new Date(0).toISOString(),
                errorMessage: "boom",
                inputToken: 3,
                cachedInputToken: 1,
                outputToken: 2,
            });

            const full = await app.request(`/activity/${activityId}/log`);
            const fullBody = (await full.json()) as ActivityLogResponse;
            expect(fullBody.from).toBeUndefined();
            expect(fullBody.logs.map((item) => item.message)).toEqual(["one", "two"]);

            const tail = await app.request(`/activity/${activityId}/log?from=1`);
            const tailBody = (await tail.json()) as ActivityLogResponse;
            expect(tailBody.from).toBe(1);
            expect(tailBody.logs.map((item) => item.message)).toEqual(["two"]);

            const past = await app.request(`/activity/${activityId}/log?from=9`);
            expect(await past.json()).toEqual({ status: "completed", logVersion: "1", from: 9, logs: [] });

            const invalid = await app.request(`/activity/${activityId}/log?from=nope`);
            expect(invalid.status).toBe(400);
        });

        it("writes common entries and preserves them while appending tool entries", async () => {
            logAgent(activityId, "starting", "Plan");
            logAgentError(activityId, "failed", new Error("connection lost"), "Plan");
            await runAgentLoop(createSender([call]), "system", "prompt", "Plan", {
                activityId,
                toolList: [{ name: "read", description: "read", parameters: {}, execute: async () => ({ value: 7 }) }],
            });
            const changeCount = db.$client.query("SELECT total_changes() AS count");
            const beforeRead = changeCount.get();
            const response = await app.request(`/activity/${activityId}/log`);
            const body = (await response.json()) as ActivityLogResponse;
            expect(body.logs[0]).toMatchObject({ type: "common", level: "info", message: "starting" });
            expect(body.logs[1]).toMatchObject({ type: "common", level: "error" });
            const toolLogList = body.logs.filter((entry) => entry.type !== "common");
            expect(toolLogList.map((entry) => entry.type)).toEqual(["tool-call", "tool-result"]);
            expect(toolLogList[0]).toMatchObject({ toolName: "read", message: call.arguments });
            expect(toolLogList[1]).toMatchObject({ toolCallId: toolLogList[0].toolCallId, message: '{"value":7}' });
            expect(body.logs.every((entry) => Number.isFinite(Date.parse(entry.timestamp)))).toBe(true);
            expect(changeCount.get()).toEqual(beforeRead);
        });
    });

    describe("tool log lifecycle", () => {
        it("keeps concurrent results paired when completion order differs from call order", async () => {
            const slow = Promise.withResolvers<string>();
            const fast = Promise.withResolvers<string>();
            const started = Promise.withResolvers<void>();
            const tool: AgentTool = {
                name: "read",
                description: "read",
                parameters: {},
                execute: (argument) => {
                    if (argument.path === "slow") return slow.promise;
                    started.resolve();
                    return fast.promise;
                },
            };
            const run = runAgentLoop(
                createSender([
                    { ...call, arguments: '{"path":"slow"}' },
                    { ...call, id: "provider-second", arguments: '{"path":"fast"}' },
                ]),
                "system",
                "prompt",
                "Plan",
                { activityId, toolList: [tool] },
            );
            await started.promise;
            fast.resolve("fast result");
            slow.resolve("slow result");
            const result = await run;

            const logList = await readToolLogList();
            expect(logList.map((entry) => entry.type)).toEqual([
                "tool-call",
                "tool-call",
                "tool-result",
                "tool-result",
            ]);
            expect(logList[2].toolCallId).toBe(logList[1].toolCallId);
            expect(logList[2].message).toBe("fast result");
            expect(logList[3].toolCallId).toBe(logList[0].toolCallId);
            expect(logList[3].message).toBe("slow result");
            expect(logList[0].toolCallId).not.toBe(logList[1].toolCallId);
            expect(
                result.messages.filter((message) => message.role === "tool").map((message) => message.toolCallId),
            ).toEqual([call.id, "provider-second"]);

            await runAgentLoop(createSender([call]), "system", "prompt", "Plan", {
                activityId,
                toolList: [{ ...tool, execute: async () => "again" }],
            });
            const callLogList = (await readToolLogList()).filter((entry) => entry.type === "tool-call");
            expect(new Set(callLogList.map((entry) => entry.toolCallId)).size).toBe(3);
        });

        it.each(["throw", "return"])("records a tool error for a %s error", async (mode) => {
            const tool: AgentTool = {
                name: "read",
                description: "read",
                parameters: {},
                execute: async () => {
                    if (mode === "throw") throw new Error("file unavailable");
                    return { error: "file unavailable" };
                },
            };
            const result = await runAgentLoop(createSender([call]), "system", "prompt", "Plan", {
                activityId,
                toolList: [tool],
            });
            const logList = await readToolLogList();
            expect(logList.map((entry) => entry.type)).toEqual(["tool-call", "tool-error"]);
            expect(logList[1]).toMatchObject({ level: "error", toolName: "read", toolCallId: logList[0].toolCallId });
            expect(logList[1].message).toContain("file unavailable");
            expect(result.messages.find((message) => message.role === "tool")?.content).toBe(
                '{"error":"file unavailable"}',
            );
        });

        it("records the call and error for an unknown tool", async () => {
            const result = await runAgentLoop(createSender([call]), "system", "prompt", "Plan", { activityId });
            const logList = await readToolLogList();
            expect(logList.map((entry) => entry.type)).toEqual(["tool-call", "tool-error"]);
            expect(logList[1]).toMatchObject({ level: "error", toolName: "read", toolCallId: logList[0].toolCallId });
            expect(result.messages.find((message) => message.role === "tool")?.toolCallId).toBe(call.id);
        });

        it("records invalid arguments before preserving the loop failure", async () => {
            const execute = mock(async () => "unused");
            await expect(
                runAgentLoop(createSender([{ ...call, arguments: "{" }]), "system", "prompt", "Plan", {
                    activityId,
                    toolList: [{ name: "read", description: "read", parameters: {}, execute }],
                }),
            ).rejects.toBeInstanceOf(SyntaxError);
            expect(execute).not.toHaveBeenCalled();
            const logList = await readToolLogList();
            expect(logList.map((entry) => entry.type)).toEqual(["tool-call", "tool-error"]);
            expect(logList[0].message).toBe("{");
            expect(logList[1].toolCallId).toBe(logList[0].toolCallId);
        });

        it("truncates only the stored text and keeps untrusted wrapping in the model context", async () => {
            const content = "x".repeat(1200);
            const result = await runAgentLoop(createSender([call]), "system", "prompt", "Plan", {
                activityId,
                toolList: [
                    {
                        name: "read",
                        description: "read",
                        parameters: {},
                        untrustedResult: true,
                        execute: async () => content,
                    },
                ],
            });
            const logList = await readToolLogList();
            expect(logList[1]).toMatchObject({ type: "tool-result", message: `${content.slice(0, 1000)}…` });
            expect(logList[1]).not.toHaveProperty("truncated");
            expect(result.messages.find((message) => message.role === "tool")?.content).toBe(
                wrapUntrustedToolContent(content),
            );
        });
    });
}
