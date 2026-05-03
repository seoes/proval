import type { AgentTool } from "../loop.js";
import {
    reviewTargetAppendSchema,
    type ReviewTarget,
} from "../../module/merge-request/review-target.schema.js";

export function appendReviewTargetTool(reviewTargetList: ReviewTarget[]): AgentTool {
    return {
        name: "append_review_target",
        description:
            "Append one confirmed review target to the deep review plan. Call once per distinct target after you have evidence from diffs or file reads. The canonical plan is this tool output; do not rely on a JSON blob in your final message. IDs are assigned by the server.",
        parameters: {
            type: "object",
            properties: {
                category: {
                    type: "string",
                    enum: ["security", "correctness", "performance", "api", "error_handling", "design", "concurrency"],
                    description: "Primary category for this review target.",
                },
                file: {
                    type: "string",
                    description: "Repository-relative path of the main file for this target.",
                },
                description: {
                    type: "string",
                    description: "Short actionable description of what the sub-agent should verify.",
                },
                severity: {
                    type: "string",
                    enum: ["critical", "warning", "suggestion"],
                    description: "Severity of the suspected problem.",
                },
            },
            required: ["category", "file", "description", "severity"],
        },
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
