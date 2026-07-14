import { z } from "zod";

export const skipFileSchema = z.object({
    path: z.string().describe("Repo-relative path from the changed file list."),
    reason: z.string().describe("Why this changed file is excluded from review."),
});

export type SkippedFile = z.infer<typeof skipFileSchema>;

const REVIEW_UNIT_DESCRIPTION_HELP =
    "Why these changed files belong together — architecture, data flow, contracts. No bug hypotheses or review findings.";

export const reviewUnitReferenceSchema = z.object({
    path: z
        .string()
        .describe(
            "Full repo-root-relative file path at PR head (e.g. apps/web/modules/foo.tsx). Resolve with glob or list_directory first. Not an import alias (@/…), package name, or path relative to another file.",
        ),
    reason: z.string().describe("Brief reason the sub-agent should read this file."),
});

export type ReviewUnitReference = z.infer<typeof reviewUnitReferenceSchema>;

/** Payload accepted by append_review_unit; server assigns monotonic id. */
export const reviewUnitAppendSchema = z.object({
    files: z
        .array(z.string())
        .min(1)
        .describe(
            "Full repo-root-relative paths from the PR changed file list (exact strings from context). A path may appear in multiple units.",
        ),
    name: z.string().describe("Short label for this review unit."),
    description: z.string().describe(REVIEW_UNIT_DESCRIPTION_HELP),
    references: z
        .array(reviewUnitReferenceSchema)
        .optional()
        .default([])
        .describe(
            "Optional context files beyond this unit's files[] — unchanged repo files or changed files assigned to other units. Each path must be a resolved full repo-root file path and must not duplicate this unit's files[].",
        ),
});

export type ReviewUnitAppendInput = z.infer<typeof reviewUnitAppendSchema>;

export type ReviewUnit = ReviewUnitAppendInput & { id: number };
