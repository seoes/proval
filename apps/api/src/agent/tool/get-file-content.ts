import type { AgentTool } from "../llm/loop.js";
import type { GitProvider } from "../../git-provider/types.js";
import { FILE_CONTENT_MAX_LINES, getFileContentInputSchema } from "../schema/get-file-content.schema.js";

export function getFileContentTool(provider: GitProvider, ref: string): AgentTool {
    return {
        name: "get_file_content",
        description: `Read file content from specific commit (ref: ${ref}). At most ${FILE_CONTENT_MAX_LINES} lines per call. For files over ${FILE_CONTENT_MAX_LINES} lines use fromLine/toLine (1-based inclusive) to paginate. Use this to: (1) read context around a diff to understand surrounding functions and imports, (2) trace caller/callee paths, (3) verify interface contracts, (4) check data flow end-to-end. Do NOT read the whole repository — only files that validate a specific suspicion.`,
        parameters: getFileContentInputSchema.toJSONSchema(),
        execute: async (args) => {
            const { filePath, fromLine, toLine } = getFileContentInputSchema.parse(args);

            const lines = (await provider.fetchFileContent(filePath, ref)).split("\n");

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
