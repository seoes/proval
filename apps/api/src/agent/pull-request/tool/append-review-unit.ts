import type { AgentTool } from "../../llm/loop.js";
import { reviewUnitAppendSchema, type ReviewUnit } from "../review/plan.schema.js";

export function appendReviewUnitTool(reviewUnitList: ReviewUnit[]): AgentTool {
    return {
        name: "append_review_unit",
        description: [
            "Append one review unit (a logical group of related changed files) to the review plan.",
            "Call once per group, only after you understand the workflows and responsibility boundaries involved.",
            "files: exact changed paths from the PR changed file list (repo-root-relative full paths).",
            "description: why these files belong together (workflow, data flow, contracts, responsibility boundaries — no bug hypotheses).",
            "references: { path, reason } entries for context beyond this unit's files[] (unchanged repo files or changed files from other units).",
            "Include references whenever the unit is incomplete without neighboring call sites, shared contracts, or files that may now own logic removed from this unit — a direct import is not required if runtime flow connects them.",
            "reason should tell the sub-agent what to verify at that path.",
            "For each reference path, resolve the full repo-root file path with search_file_by_name or get_directory_tree before calling — never use import aliases, package names, or paths relative to another file.",
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
                references: parsed.references,
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
