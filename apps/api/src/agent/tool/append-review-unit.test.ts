import { describe, expect, it } from "bun:test";
import type { ReviewUnit } from "../schema/deep-research.schema.js";
import { appendReviewUnitTool } from "./append-review-unit.js";

describe("appendReviewUnitTool", () => {
    it("assigns monotonic ids and appends units", async () => {
        const reviewUnitList: ReviewUnit[] = [];
        const tool = appendReviewUnitTool(reviewUnitList);

        const result = await tool.execute({
            files: ["src/a.ts", "src/b.ts"],
            name: "auth flow",
            description: "Scope: handler and service changed together.\nReferences:",
        });

        expect(result).toEqual({
            ok: true,
            appended: {
                id: 1,
                files: ["src/a.ts", "src/b.ts"],
                name: "auth flow",
                description: "Scope: handler and service changed together.\nReferences:",
            },
            total: 1,
        });
        expect(reviewUnitList).toHaveLength(1);
    });

    it("allows the same file in multiple units", async () => {
        const reviewUnitList: ReviewUnit[] = [];
        const tool = appendReviewUnitTool(reviewUnitList);

        await tool.execute({
            files: ["src/a.ts"],
            name: "unit 1",
            description: "Scope: entry layer.",
        });

        const result = await tool.execute({
            files: ["src/a.ts", "src/b.ts"],
            name: "unit 2",
            description: "Scope: shared contract with b.",
        });

        expect(result).toEqual({
            ok: true,
            appended: {
                id: 2,
                files: ["src/a.ts", "src/b.ts"],
                name: "unit 2",
                description: "Scope: shared contract with b.",
            },
            total: 2,
        });
        expect(reviewUnitList).toHaveLength(2);
    });
});
