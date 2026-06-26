import z from "zod";

export const FILE_CONTENT_MAX_LINES = 300;

export const getFileContentInputSchema = z
    .object({
        filePath: z.string().describe("Repository-relative path to the file."),
        fromLine: z
            .number()
            .optional()
            .describe(`First line to include (1-based). Use only when file is over ${FILE_CONTENT_MAX_LINES} lines.`),
        toLine: z
            .number()
            .optional()
            .describe(`Last line to include (1-based). Use only when file is over ${FILE_CONTENT_MAX_LINES} lines.`),
    })
    .strict();

export const getMergeFileContentInputSchema = getFileContentInputSchema.extend({
    commit: z.enum(["head", "base"]).describe("The commit to read the file from."),
});
