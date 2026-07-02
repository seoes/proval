import type { AgentTool } from "../../llm/loop.js";
import { skipFileSchema, type SkippedFile } from "../schema/deep-research.schema.js";

export function skipFileTool(skippedFileList: SkippedFile[]): AgentTool {
    return {
        name: "skip_file",
        description:
            "Mark a changed file as excluded from deep review. Call once per skipped path from the changed file list before finishing the plan. Every changed file must end up in append_review_unit files[] or skip_file. Provide a clear reason. Do not skip behavior-changing code.",
        parameters: skipFileSchema.toJSONSchema(),
        execute: async (args) => {
            const parsed = skipFileSchema.parse(args);
            const alreadySkipped = skippedFileList.some((f) => f.path === parsed.path);

            if (alreadySkipped) {
                return {
                    ok: false,
                    error: `File already skipped: ${parsed.path}`,
                };
            }

            skippedFileList.push(parsed);
            return {
                ok: true,
                skipped: parsed,
                total: skippedFileList.length,
            };
        },
    };
}
