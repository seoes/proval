import type { AgentTool } from "../llm/loop.js";
import { reviewUnitAppendSchema, type ReviewUnit } from "../schema/deep-research.schema.js";

export function appendReviewUnitTool(reviewUnitList: ReviewUnit[]): AgentTool {
    return {
        name: "append_review_unit",
        description: [
            "Append one review unit (a logical group of related changed files) to the deep review plan.",
            "Call once per group.",
            "files: changed paths to review (same path may appear in multiple units).",
            "description must use labeled sections:",
            "Scope: why these files belong together (structure/flow only — no bug hypotheses).",
            "References: optional — repo paths NOT in the MR diff, one per line with a brief read reason.",
            "Do not list changed files under References; put them in files.",
            "The canonical plan is built only through tool calls; do not output a JSON plan in your final message.",
            "IDs are assigned by the server.",
        ].join(" "),
        parameters: reviewUnitAppendSchema.toJSONSchema(),
        execute: async (args) => {
            const parsed = reviewUnitAppendSchema.parse(args);
            const unit: ReviewUnit = {
                id: reviewUnitList.length + 1,
                files: parsed.files,
                name: parsed.name,
                description: parsed.description,
            };
            reviewUnitList.push(unit);
            return {
                ok: true,
                appended: unit,
                total: reviewUnitList.length,
            };
        },
    };
}
