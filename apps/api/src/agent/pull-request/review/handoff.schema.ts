import { z } from "zod";

export const reviewHandoffSeveritySchema = z
    .enum(["critical", "problem", "suggestion"])
    .describe(
        "critical: crash, security, data loss, or broken production behavior. problem: performance, weak error handling, realistic edge-case failures. suggestion: minor or stylistic improvements that should not be Main Issues.",
    );

export const reviewHandoffGoodPointCategorySchema = z
    .enum(["design", "testing", "clarity", "safety", "maintainability"])
    .describe("Category of the good point.");

export const reviewHandoffFindingSchema = z.object({
    priority: z
        .number()
        .int()
        .min(1)
        .describe(
            "Importance within this unit. 1 = most important. Use consecutive integers starting at 1. Order findingList with priority 1 first.",
        ),
    file: z.string().describe("Exact repo-root-relative path from the diff or workspace."),
    line: z.number().int().min(1).describe("1-based line number on the new file side for added or changed code."),
    severity: reviewHandoffSeveritySchema,
    problem: z
        .string()
        .describe("2 to 4 sentences: what is wrong, naming concrete symbols or behavior at file and line."),
    impact: z.string().describe("1 to 2 sentences: why this matters in production or maintainability."),
    fix: z.string().describe("1 to 3 sentences: what should change."),
    suggestedCode: z
        .string()
        .optional()
        .describe(
            "Optional concrete improved code for the author to apply. Use a markdown fenced code block with a language tag when helpful. Focus on the fix, not a full file rewrite.",
        ),
});

export type ReviewHandoffFinding = z.infer<typeof reviewHandoffFindingSchema>;

export const reviewHandoffGoodPointSchema = z.object({
    rank: z
        .number()
        .int()
        .min(1)
        .describe(
            "Quality within this unit. 1 = best or most notable. Use consecutive integers starting at 1. Order goodPointList with rank 1 first.",
        ),
    file: z.string().describe("Exact repo-root-relative path."),
    line: z.number().int().min(1).describe("1-based line number on the new file side."),
    category: reviewHandoffGoodPointCategorySchema,
    whatWentWell: z
        .string()
        .describe("2 to 3 sentences: what the author did well, with evidence from the cited file and line."),
    whyItMatters: z.string().describe("1 to 2 sentences: benefit for correctness, maintainability, or team workflow."),
});

export type ReviewHandoffGoodPoint = z.infer<typeof reviewHandoffGoodPointSchema>;

/** Payload accepted by submit_review_handoff; server adds unitId and unitName from the assigned review unit. */
export const reviewHandoffInputSchema = z.object({
    findingList: z
        .array(reviewHandoffFindingSchema)
        .describe("Findings in priority order. Empty array is valid when there are no findings."),
    goodPointList: z
        .array(reviewHandoffGoodPointSchema)
        .describe("Good points in rank order. Empty array is valid when there are none."),
    ruledOut: z
        .string()
        .optional()
        .describe(
            "Recommended when you investigated suspicions that did not become findings: brief list of what you checked and dismissed, so the writing agent knows what was already verified.",
        ),
});

export type ReviewHandoffInput = z.infer<typeof reviewHandoffInputSchema>;

export type ReviewHandoff = ReviewHandoffInput & {
    unitId: number;
    unitName: string;
};
