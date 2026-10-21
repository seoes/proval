import { describe, expect, test } from "bun:test";

import { ReviewAdmission, reviewConcurrencyFromEnv } from "./admission.js";

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe("reviewConcurrencyFromEnv", () => {
    test("unset, empty, zero or nonsense mean unlimited", () => {
        expect(reviewConcurrencyFromEnv({})).toBe(0);
        expect(reviewConcurrencyFromEnv({ PROVAL_REVIEW_CONCURRENCY: "" })).toBe(0);
        expect(reviewConcurrencyFromEnv({ PROVAL_REVIEW_CONCURRENCY: "0" })).toBe(0);
        expect(reviewConcurrencyFromEnv({ PROVAL_REVIEW_CONCURRENCY: "lots" })).toBe(0);
        expect(reviewConcurrencyFromEnv({ PROVAL_REVIEW_CONCURRENCY: "-2" })).toBe(0);
    });

    test("a positive integer is the limit", () => {
        expect(reviewConcurrencyFromEnv({ PROVAL_REVIEW_CONCURRENCY: " 3 " })).toBe(3);
    });
});

describe("ReviewAdmission", () => {
    test("unlimited admits everything at once", async () => {
        const gate = new ReviewAdmission(0);
        await Promise.all([gate.acquire(1), gate.acquire(2), gate.acquire(3)]);
        expect(gate.running).toBe(3);
        expect(gate.waiting).toBe(0);
    });

    test("a limit holds later arrivals in order until a slot frees", async () => {
        const gate = new ReviewAdmission(1);
        const order: number[] = [];
        const waits: Array<[number, number]> = [];
        await gate.acquire(1);
        const second = gate.acquire(2, (running, ahead) => waits.push([running, ahead])).then(() => order.push(2));
        const third = gate.acquire(3, (running, ahead) => waits.push([running, ahead])).then(() => order.push(3));
        await tick();
        expect(order).toEqual([]);
        expect(gate.waiting).toBe(2);
        expect(waits).toEqual([
            [1, 0],
            [1, 1],
        ]);
        gate.release();
        await second;
        expect(order).toEqual([2]);
        expect(gate.running).toBe(1);
        gate.release();
        await third;
        expect(order).toEqual([2, 3]);
    });

    test("a withdrawn activity never takes a slot", async () => {
        const gate = new ReviewAdmission(1);
        await gate.acquire(1);
        let granted = false;
        void gate.acquire(2).then(() => {
            granted = true;
        });
        await tick();
        expect(gate.withdraw(2)).toBe(true);
        expect(gate.withdraw(2)).toBe(false);
        gate.release();
        await tick();
        expect(granted).toBe(false);
        expect(gate.running).toBe(0);
    });

    test("raising the limit admits the waiting ones", async () => {
        const gate = new ReviewAdmission(1);
        await gate.acquire(1);
        const second = gate.acquire(2);
        gate.setMax(2);
        await second;
        expect(gate.running).toBe(2);
    });

    test("release never goes below zero", () => {
        const gate = new ReviewAdmission(2);
        gate.release();
        expect(gate.running).toBe(0);
    });
});
