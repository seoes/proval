import { z } from "zod";

/** Payload accepted by append_review_target; server assigns monotonic id. */
export const reviewTargetAppendSchema = z.object({
    category: z.enum(["security", "correctness", "performance", "api", "error_handling", "design", "concurrency"]),
    file: z.string(),
    description: z.string(),
    severity: z.enum(["critical", "problem", "suggestion"]),
});

export type ReviewTargetAppendInput = z.infer<typeof reviewTargetAppendSchema>;

export type ReviewTarget = ReviewTargetAppendInput & { id: number };
