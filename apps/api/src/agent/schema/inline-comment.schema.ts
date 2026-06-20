import { z } from "zod";
import { reviewFindingSchemaForLanguage } from "./review.schema";

const singleLinePositionSchema = z.object({
    baseSha: z.string(),
    headSha: z.string(),
    startSha: z.string(),
    oldPath: z.string(),
    newPath: z.string(),
    newLine: z.number().optional().describe("1-based line on the new file."),
    oldLine: z.number().optional().describe("1-based line on the old file."),
});

const multiLineEndpointSchema = z.object({
    type: z.enum(["old", "new"]),
    newLine: z.number().optional(),
    oldLine: z.number().optional(),
});

const multiLinePositionSchema = z.object({
    baseSha: z.string(),
    headSha: z.string(),
    startSha: z.string(),
    oldPath: z.string(),
    newPath: z.string(),
    start: multiLineEndpointSchema,
    end: multiLineEndpointSchema,
});

export function createSingleLineCommentInputSchema(language: string) {
    return reviewFindingSchemaForLanguage(language).extend({
        position: singleLinePositionSchema,
    });
}

export function createMultiLineCommentInputSchema(language: string) {
    return reviewFindingSchemaForLanguage(language).extend({
        position: multiLinePositionSchema,
    });
}
