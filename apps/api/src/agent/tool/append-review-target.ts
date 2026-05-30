import type { AgentTool } from "../loop.js";
import { reviewTargetAppendSchema, type ReviewTarget } from "../../module/pull-request/review-target.schema.js";

export function appendReviewTargetTool(reviewTargetList: ReviewTarget[]): AgentTool {
    return {
        name: "append_review_target",
        description:
            "Append one confirmed review target to the deep review plan. Call once per distinct target after you have evidence from diffs or file reads. The canonical plan is this tool output; do not rely on a JSON blob in your final message. IDs are assigned by the server.",
        parameters: reviewTargetAppendSchema.toJSONSchema(),
        execute: async (args) => {
            const parsed = reviewTargetAppendSchema.parse(args);
            const target: ReviewTarget = {
                id: reviewTargetList.length + 1,
                category: parsed.category,
                file: parsed.file,
                description: parsed.description,
                severity: parsed.severity,
            };
            reviewTargetList.push(target);
            return {
                ok: true,
                appended: target,
                total: reviewTargetList.length,
            };
        },
    };
}
