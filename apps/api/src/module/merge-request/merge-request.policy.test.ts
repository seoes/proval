import { describe, it, expect } from "bun:test";
import { buildReviewPolicyAppendix } from "./merge-request.prompt.js";

describe("buildReviewPolicyAppendix", () => {
    it("disables inline when inlineReview is false", () => {
        const s = buildReviewPolicyAppendix({ inlineReview: false });
        expect(s).toContain("Do NOT use create_single_line_comment");
    });

    it("enables balanced inline policy when inlineReview is true", () => {
        const s = buildReviewPolicyAppendix({ inlineReview: true });
        expect(s).toContain("BALANCED");
        expect(s).toContain("at most 8");
    });
});
