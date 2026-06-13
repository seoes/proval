import { z } from "zod";

const REVIEW_UNIT_DESCRIPTION_HELP = [
    "Labeled plain text with required and optional sections:",
    "Scope: <why these changed files belong together — architecture, data flow, contracts. No bug hypotheses.>",
    "References: <optional — one repo path per line NOT in the MR diff, each with a brief reason to read it>",
].join("\n");

/** Payload accepted by append_review_unit; server assigns monotonic id. */
export const reviewUnitAppendSchema = z.object({
    files: z
        .array(z.string())
        .min(1)
        .describe("Changed file paths from the MR to review in this unit. A path may appear in multiple units."),
    name: z.string().describe("Short label for this review unit."),
    description: z.string().describe(REVIEW_UNIT_DESCRIPTION_HELP),
});

export type ReviewUnitAppendInput = z.infer<typeof reviewUnitAppendSchema>;

export type ReviewUnit = ReviewUnitAppendInput & { id: number };

export const skipFileSchema = z.object({
    path: z.string().describe("Repo-relative path from the changed file list."),
    reason: z.string().describe("Why this changed file is excluded from review."),
});

export type SkippedFile = z.infer<typeof skipFileSchema>;
