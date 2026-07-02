import { z } from "zod";
import { buildCommentBodyDescription } from "../../shared/prompt/index.js";

export const reviewFindingLevelSchema = z
    .enum(["critical", "problem"])
    .describe(
        "Severity of the finding. Use critical for urgent production harm; problem for actionable non-catastrophic issues.",
    );

const REVIEW_LEVEL_LABEL: Record<"critical" | "problem", string> = {
    critical: "🚨 [CRITICAL]",
    problem: "⚫️ [PROBLEM]",
};

export const codeSuggestionSchema = z.object({
    language: z
        .string()
        .describe(
            "Markdown fenced-code language tag for the snippet (e.g. typescript, python). Use plaintext when no specific highlighter applies.",
        ),
    suggestion: z
        .string()
        .describe(
            "Concrete improved code for the author to apply — not pseudocode. Keep it focused on the fix, not a full file rewrite.",
        ),
});

export const reviewFindingSchema = z.object({
    level: reviewFindingLevelSchema,
    title: z.string().describe("Short summary shown with the severity label (one line, no markdown heading)."),
    body: z
        .string()
        .describe(
            "User-visible comment text: problem and impact in prose. Do not repeat the title. Code identifiers and paths may stay as-is.",
        ),
    codeSuggestion: codeSuggestionSchema
        .optional()
        .describe("Optional concrete patch snippet when a small code example clarifies the fix."),
});

export type ReviewFindingLevel = z.infer<typeof reviewFindingLevelSchema>;
export type CodeSuggestion = z.infer<typeof codeSuggestionSchema>;
export type ReviewFinding = z.infer<typeof reviewFindingSchema>;

export const reviewFindingListSchema = z
    .array(reviewFindingSchema)
    .describe("Ordered list of findings for one review output, most important first.");

export type ReviewFindingList = z.infer<typeof reviewFindingListSchema>;

export function reviewFindingSchemaForLanguage(language: string) {
    return reviewFindingSchema.extend({
        title: z
            .string()
            .describe(`Short summary in ${language} shown with the severity label (one line, no markdown heading).`),
        body: z
            .string()
            .describe(`${buildCommentBodyDescription(language)} Problem and impact in prose. Do not repeat the title.`),
    });
}

export function formatReviewFindingCommentBody(finding: ReviewFinding): string {
    const lines = [`${REVIEW_LEVEL_LABEL[finding.level]} ${finding.title}`, "", finding.body];

    if (finding.codeSuggestion) {
        const { language, suggestion } = finding.codeSuggestion;
        lines.push("", `\`\`\`${language}`, suggestion, "```");
    }

    return lines.join("\n");
}
