import type { AgentTool } from "../../llm/loop.js";
import { reviewUnitAppendSchema, type ReviewUnit } from "../schema/deep-research.schema.js";

export function appendReviewUnitTool(reviewUnitList: ReviewUnit[]): AgentTool {
    return {
        name: "append_review_unit",
        description: [
            "Append one review unit (a logical group of related changed files) to the deep review plan.",
            "Call once per group.",
            "files: exact changed paths from the PR changed file list (repo-root-relative full paths).",
            "description: why these files belong together (structure/flow only — no bug hypotheses).",
            "references: optional { path, reason } entries for context beyond this unit's files[] (unchanged repo files or changed files from other units).",
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
