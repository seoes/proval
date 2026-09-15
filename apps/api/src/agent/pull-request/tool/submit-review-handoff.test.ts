import { describe, expect, it } from "bun:test";
import type { ReviewHandoff } from "../review/handoff.schema.js";
import type { ReviewUnit } from "../review/plan.schema.js";
import { submitReviewHandoffTool } from "./submit-review-handoff.js";

const unitA: ReviewUnit = {
    id: 1,
    name: "auth flow",
    files: ["src/a.ts"],
    description: "Scope: handler.",
    references: [],
};

const unitB: ReviewUnit = {
    id: 2,
    name: "api layer",
    files: ["src/b.ts"],
    description: "Scope: routes.",
    references: [],
};

describe("submitReviewHandoffTool", () => {
    it("accepts empty findingList and goodPointList", async () => {
        const reviewHandoffList: ReviewHandoff[] = [];
        const tool = submitReviewHandoffTool(reviewHandoffList, unitA);

        const result = await tool.execute({
            findingList: [],
            goodPointList: [],
        });

        expect(result).toEqual({
            ok: true,
            submitted: {
                unitId: 1,
                unitName: "auth flow",
                findingList: [],
                goodPointList: [],
                ruledOut: undefined,
            },
            total: 1,
        });
        expect(reviewHandoffList).toHaveLength(1);
    });

    it("replaces handoff when the same unit submits again", async () => {
        const reviewHandoffList: ReviewHandoff[] = [];
        const tool = submitReviewHandoffTool(reviewHandoffList, unitA);

        await tool.execute({ findingList: [], goodPointList: [] });

        const result = (await tool.execute({
            findingList: [
                {
                    priority: 1,
                    file: "src/a.ts",
                    line: 10,
                    severity: "problem",
                    problem: "Missing null check.",
                    impact: "May throw at runtime.",
                    fix: "Guard before access.",
                },
            ],
            goodPointList: [],
            ruledOut: "Checked error path in caller.",
        })) as { submitted: ReviewHandoff };

        expect(reviewHandoffList).toHaveLength(1);
        expect(result.submitted.findingList).toHaveLength(1);
        expect(result.submitted.ruledOut).toBe("Checked error path in caller.");
    });

    it("appends handoffs for different units", async () => {
        const reviewHandoffList: ReviewHandoff[] = [];
        const toolA = submitReviewHandoffTool(reviewHandoffList, unitA);
        const toolB = submitReviewHandoffTool(reviewHandoffList, unitB);

        await toolA.execute({ findingList: [], goodPointList: [] });
        const result = (await toolB.execute({ findingList: [], goodPointList: [] })) as { total: number };

        expect(reviewHandoffList).toHaveLength(2);
        expect(result.total).toBe(2);
        expect(reviewHandoffList.map((h) => h.unitId)).toEqual([1, 2]);
    });
});
