import { describe, expect, it } from "bun:test";
import { Limiter, loadLimiter } from "./concurrency.js";

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
