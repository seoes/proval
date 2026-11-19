import type { AgentTool } from "../../llm/loop.js";
import { reviewUnitAppendSchema, type ReviewUnit } from "../review/plan.schema.js";

/**
 * maxUnitCount is the unit budget triage set. The planner is told the budget in its
 * prompt, but a prompt is a request: one 86 file merge request was planned as 7 units
 * under a cap of 6. So the tool enforces it. Once the plan is full, a further unit is
 * merged into the last one instead of being dropped, so every file the planner placed
 * is still reviewed, and the planner is told to stop adding units.
 */
export function appendReviewUnitTool(reviewUnitList: ReviewUnit[], maxUnitCount: number | null = null): AgentTool {
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
            "For each reference path, resolve the full repo-root file path with glob or list_directory before calling — never use import aliases, package names, or paths relative to another file.",
            "The canonical plan is built only through tool calls; do not output a JSON plan in your final message.",
            "IDs are assigned by the server.",
        ].join(" "),
        parameters: reviewUnitAppendSchema.toJSONSchema(),
        execute: async (args) => {
            const parsed = reviewUnitAppendSchema.parse(args);
            const last = reviewUnitList[reviewUnitList.length - 1];
            if (maxUnitCount !== null && maxUnitCount > 0 && last && reviewUnitList.length >= maxUnitCount) {
                last.files = [...new Set([...last.files, ...parsed.files])];
                last.name = `${last.name} + ${parsed.name}`;
                last.description = `${last.description}\n\n${parsed.name}: ${parsed.description}`;
                const seen = new Set(last.references.map((r) => r.path));
                last.references = [...last.references, ...parsed.references.filter((r) => !seen.has(r.path))];
                return {
                    ok: true,
                    merged: true,
                    mergedInto: last.id,
                    total: reviewUnitList.length,
                    note: `The plan already has ${maxUnitCount} unit(s), the most this review allows, so these files were merged into unit ${last.id}. Do not append more units: place any remaining files in the existing units' scope or skip them, then finish.`,
                };
            }
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
