import { describe, expect, it } from "bun:test";
import type { ReviewUnit } from "../review/plan.schema.js";
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
                references: [],
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
                references: [],
            },
            total: 2,
        });
        expect(reviewUnitList).toHaveLength(2);
    });

    it("merges a unit beyond the budget into the last unit instead of adding it", async () => {
        const reviewUnitList: ReviewUnit[] = [];
        const tool = appendReviewUnitTool(reviewUnitList, 2);
        await tool.execute({ files: ["a.ts"], name: "one", description: "first" });
        await tool.execute({ files: ["b.ts"], name: "two", description: "second" });
        const result = (await tool.execute({
            files: ["b.ts", "c.ts"],
            name: "three",
            description: "third",
            references: [{ path: "d.ts", reason: "caller" }],
        })) as { merged?: boolean; mergedInto?: number; total: number };

        expect(result.merged).toBe(true);
        expect(result.mergedInto).toBe(2);
        expect(result.total).toBe(2);
        expect(reviewUnitList).toHaveLength(2);
        expect(reviewUnitList[1]!.files).toEqual(["b.ts", "c.ts"]);
        expect(reviewUnitList[1]!.references.map((r) => r.path)).toEqual(["d.ts"]);
        expect(reviewUnitList[1]!.description).toContain("three: third");
    });

    it("adds units freely when there is no budget", async () => {
        const reviewUnitList: ReviewUnit[] = [];
        const tool = appendReviewUnitTool(reviewUnitList);
        for (const name of ["a", "b", "c"]) {
            await tool.execute({ files: [`${name}.ts`], name, description: name });
        }
        expect(reviewUnitList).toHaveLength(3);
    });
});
