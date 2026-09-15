import type { AgentTool } from "../../llm/loop.js";
import { reviewHandoffInputSchema, type ReviewHandoff } from "../review/handoff.schema.js";
import type { ReviewUnit } from "../review/plan.schema.js";

export function submitReviewHandoffTool(reviewHandoffList: ReviewHandoff[], reviewUnit: ReviewUnit): AgentTool {
    return {
        name: "submit_review_handoff",
        description: [
            "Submit this review unit's handoff for the writing agent.",
            "Call exactly once when Phase B is done.",
            "findingList and goodPointList may be empty arrays when there are no findings or good points.",
            "Do not use comment or approval tools.",
            "Do not put the handoff in your final assistant message.",
            "A second call for the same unit replaces the previous submission.",
            "For each entry in findingList or goodPointList, file and line are required.",
        ].join(" "),
        parameters: reviewHandoffInputSchema.toJSONSchema(),
        execute: async (args) => {
            const parsed = reviewHandoffInputSchema.parse(args);
            const submitted: ReviewHandoff = {
                unitId: reviewUnit.id,
                unitName: reviewUnit.name,
                findingList: parsed.findingList,
                goodPointList: parsed.goodPointList,
                ruledOut: parsed.ruledOut,
            };

            const existingIndex = reviewHandoffList.findIndex((item) => item.unitId === reviewUnit.id);
            if (existingIndex >= 0) {
                reviewHandoffList[existingIndex] = submitted;
            } else {
                reviewHandoffList.push(submitted);
            }

            return {
                ok: true,
                submitted,
                total: reviewHandoffList.length,
            };
        },
    };
}
