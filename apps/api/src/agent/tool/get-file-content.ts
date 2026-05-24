import type { AgentTool } from "../loop.js";
import type { GitProvider } from "../../provider/types.js";

const MAX_LINES = 300;

export function getFileContentTool(provider: GitProvider, ref: string): AgentTool {
    return {
        name: "get_file_content",
        description: `Read file content from the MR source branch (ref: ${ref}). At most ${MAX_LINES} lines per call. For files over ${MAX_LINES} lines use fromLine/toLine (1-based inclusive) to paginate. Use this to: (1) read context around a diff to understand surrounding functions and imports, (2) trace caller/callee paths, (3) verify interface contracts, (4) check data flow end-to-end. Do NOT read the whole repository — only files that validate a specific suspicion.`,
        parameters: {
            type: "object",
            properties: {
                filePath: { type: "string", description: "Repository-relative path to the file." },
                fromLine: {
                    type: "number",
                    description: `First line to include (1-based). Use only when file is over ${MAX_LINES} lines.`,
                },
                toLine: {
                    type: "number",
                    description: `Last line to include (1-based). Use only when file is over ${MAX_LINES} lines.`,
                },
            },
            required: ["filePath"],
        },
        execute: async (args) => {
            const filePath = String(args.filePath);
            const fromLine = args.fromLine != null ? Math.max(1, Math.floor(Number(args.fromLine))) : undefined;
            const toLine = args.toLine != null ? Math.max(1, Math.floor(Number(args.toLine))) : undefined;

            const lines = (await provider.fetchFileContent(filePath, ref)).split("\n");

            if (fromLine === undefined && toLine === undefined) {
                if (lines.length <= MAX_LINES) return lines.join("\n");
                return {
                    warning: `File is too large (${lines.length} lines). Showing first ${MAX_LINES} lines. Use 'fromLine' and 'toLine' to read large file.`,
                    content: lines.slice(0, MAX_LINES).join("\n"),
                    totalLines: lines.length,
                };
            }

            let from = fromLine ?? 1;
            let to = toLine ?? lines.length;
            if (from > to) [from, to] = [to, from];
            if (from > lines.length) return "";

            to = Math.min(to, lines.length);
            let warning: string | undefined;
            if (to - from + 1 > MAX_LINES) {
                to = from + MAX_LINES - 1;
                warning = `Line range exceeds ${MAX_LINES} lines. Showing ${from}-${to}.`;
            }

            const content = lines.slice(from - 1, to).join("\n");
            return warning ? { warning, content } : content;
        },
    };
}
