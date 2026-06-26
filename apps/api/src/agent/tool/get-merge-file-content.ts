import type { AgentTool } from "../llm/loop.js";
import type { GitProvider } from "../../git-provider/types.js";
import { FILE_CONTENT_MAX_LINES, getMergeFileContentInputSchema } from "../schema/get-file-content.schema.js";

export function getMergeFileContentTool(
    provider: GitProvider,
    { baseSha, headSha }: { baseSha: string; headSha: string },
): AgentTool {
    return {
        name: "get_merge_file_content",
        description: `Read file content from the MR. Choose base or head commit to read the file from. At most ${FILE_CONTENT_MAX_LINES} lines per call. For files over ${FILE_CONTENT_MAX_LINES} lines use fromLine/toLine (1-based inclusive) to paginate. Use this to: (1) read context around a diff to understand surrounding functions and imports, (2) trace caller/callee paths, (3) verify interface contracts, (4) check data flow end-to-end. Do NOT read the whole repository — only files that validate a specific suspicion.`,
        parameters: getMergeFileContentInputSchema.toJSONSchema(),
        execute: async (args) => {
            const { filePath, commit, fromLine, toLine } = getMergeFileContentInputSchema.parse(args);

            const ref = commit === "head" ? headSha : baseSha;

            let lines: string[] = [];
            try {
                lines = (await provider.fetchFileContent(filePath, ref)).split("\n");
            } catch {
                if (commit === "base") {
                    return {
                        error: "File not found at base commit, This path is likely new in this change. Try checking the head commit instead.",
                    };
                } else {
                    return {
                        error: "File not found at head commit, This path is likely deleted in this change. Try checking the base commit instead.",
                    };
                }
            }

            if (fromLine === undefined && toLine === undefined) {
                if (lines.length <= FILE_CONTENT_MAX_LINES) return lines.join("\n");
                return {
                    warning: `File is too large (${lines.length} lines). Showing first ${FILE_CONTENT_MAX_LINES} lines. Use 'fromLine' and 'toLine' to read large file.`,
                    content: lines.slice(0, FILE_CONTENT_MAX_LINES).join("\n"),
                    totalLines: lines.length,
                };
            }

            let from = fromLine ?? 1;
            let to = toLine ?? lines.length;
            if (from > to) [from, to] = [to, from];
            if (from > lines.length) return "";

            to = Math.min(to, lines.length);
            let warning: string | undefined;
            if (to - from + 1 > FILE_CONTENT_MAX_LINES) {
                to = from + FILE_CONTENT_MAX_LINES - 1;
                warning = `Line range exceeds ${FILE_CONTENT_MAX_LINES} lines. Showing ${from}-${to}.`;
            }

            const content = lines.slice(from - 1, to).join("\n");
            return warning ? { warning, content } : content;
        },
    };
}
