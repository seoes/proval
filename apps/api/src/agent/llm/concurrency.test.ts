import { describe, expect, it } from "bun:test";
import type { SenderConfig } from "./factory.js";

if (process.env.PROVAL_CONCURRENCY_TEST_CHILD !== "1") {
    it("passes sender concurrency in an isolated process", () => {
        const result = Bun.spawnSync([process.execPath, "test", import.meta.path], {
            env: { ...process.env, PROVAL_CONCURRENCY_TEST_CHILD: "1", DB_FILE_NAME: ":memory:" },
            stdout: "pipe",
            stderr: "pipe",
        });
        if (result.exitCode !== 0) throw new Error(result.stdout.toString() + result.stderr.toString());
        expect(result.exitCode).toBe(0);
    }, 30000);
} else {
    const { Limiter, loadLimiter } = await import("./concurrency.js");
    const { createSender } = await import("./factory.js");

    function createDeferred() {
        let resolve: () => void = () => {};
        const promise = new Promise<void>((res) => {
            resolve = res;
        });
        return { promise, resolve };
    }

    describe("Limiter", () => {
        it("never runs more task than the maximum at once", async () => {
            const limiter = new Limiter(2);
            let active = 0;
            let peak = 0;
            const gateList = [createDeferred(), createDeferred(), createDeferred(), createDeferred()];

            const runList = gateList.map((gate) =>
                limiter.run(async () => {
                    active++;
                    peak = Math.max(peak, active);
                    await gate.promise;
                    active--;
                }),
            );

            await Bun.sleep(0);
            expect(peak).toBe(2);

            for (const gate of gateList) {
                gate.resolve();
                await Bun.sleep(0);
            }

            await Promise.all(runList);
            expect(peak).toBe(2);
            expect(active).toBe(0);
        });

        it("releases the slot when a task throws so later task still run", async () => {
            const limiter = new Limiter(1);
            const orderList: string[] = [];

            const failing = limiter.run(async () => {
                orderList.push("first");
                throw new Error("boom");
            });

            const following = limiter.run(async () => {
                orderList.push("second");
                return "done";
            });

            await expect(failing).rejects.toThrow("boom");
            await expect(following).resolves.toBe("done");
            expect(orderList).toEqual(["first", "second"]);
        });

        it("treats a null maximum as unbounded", async () => {
            const limiter = new Limiter(null);
            let active = 0;
            let peak = 0;
            const gate = createDeferred();

            const runList = [0, 1, 2, 3, 4].map(() =>
                limiter.run(async () => {
                    active++;
                    peak = Math.max(peak, active);
                    await gate.promise;
                    active--;
                }),
            );

            await Bun.sleep(0);
            expect(peak).toBe(5);
            gate.resolve();
            await Promise.all(runList);
        });
    });

    describe("loadLimit", () => {
        it("reuses one limiter for a provider id and keeps the maximum", async () => {
            const first = loadLimiter(7, 1);
            const second = loadLimiter(7, 1);
            expect(first).toBe(second);

            let active = 0;
            let peak = 0;
            const gate = createDeferred();
            const runList = [first, second].map((limiter) =>
                limiter.run(async () => {
                    active++;
                    peak = Math.max(peak, active);
                    await gate.promise;
                    active--;
                }),
            );

            await Bun.sleep(0);
            expect(peak).toBe(1);
            gate.resolve();
            await Promise.all(runList);
        });

        it("creates a separate limiter when the provider id is missing", () => {
            const first = loadLimiter(undefined, 1);
            const second = loadLimiter(undefined, 1);
            expect(first).not.toBe(second);
        });

        it("raises the shared maximum when the same provider id is requested again", async () => {
            const first = loadLimiter(7, 1);
            const second = loadLimiter(7, 2);
            expect(first).toBe(second);

            let active = 0;
            let peak = 0;
            const gate = createDeferred();
            const runList = [0, 1].map(() =>
                second.run(async () => {
                    active++;
                    peak = Math.max(peak, active);
                    await gate.promise;
                    active--;
                }),
            );

            await Bun.sleep(0);
            expect(peak).toBe(2);
            gate.resolve();
            await Promise.all(runList);
        });
    });

    describe("sender concurrency", () => {
        it.each(["openai", "openai_responses", "anthropic", "xai"] as const)(
            "shares the provider limit and releases failed requests for %s",
            async (provider) => {
                const gate = createDeferred();
                const entered = createDeferred();
                let active = 0;
                let peak = 0;
                let requestCount = 0;
                const config: SenderConfig = {
                    provider,
                    apiKey: "test",
                    baseURL: "https://llm.example/v1",
                    model: "test",
                    timeoutSecond: 10,
                    modelProviderId: 9001,
                    concurrency: 1,
                    getAccessToken: async () => "test",
                };
                const originalFetch = globalThis.fetch;
                globalThis.fetch = (async () => {
                    requestCount++;
                    active++;
                    peak = Math.max(peak, active);
                    entered.resolve();
                    await gate.promise;
                    active--;
                    return Response.json({ error: { message: "Invalid test request" } }, { status: 400 });
                }) as unknown as typeof fetch;
                const senderList = [createSender(config), createSender(config)];
                const run = Promise.allSettled(
                    senderList.map((sender) => sender.send([{ role: "user", content: "Test" }], [])),
                );
                let startedCount = 0;
                let resultList: PromiseSettledResult<unknown>[] = [];
                try {
                    await entered.promise;
                    await Bun.sleep(0);
                    startedCount = requestCount;
                    gate.resolve();
                    resultList = await run;
                } finally {
                    globalThis.fetch = originalFetch;
                }
                expect(startedCount).toBe(1);
                expect(peak).toBe(1);
                expect(requestCount).toBe(2);
                expect(resultList.every((result) => result.status === "rejected")).toBe(true);
                expect(senderList[0].getModel().model).toBe("test");
            },
        );
    });
}
