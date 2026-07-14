import type { AgentTool } from "../../llm/loop.js";
import type { Workspace } from "../../../git-provider/workspace.js";
import { FILE_CONTENT_MAX_LINES, getFileContentInputSchema } from "../schema/get-file-content.schema.js";
import { UNTRUSTED_WARNING_TOOL_PROMPT } from "../prompt/untrusted-warning.prompt.js";

function paginateLines(content: string, fromLine?: number, toLine?: number) {
    const lines = content.split("\n");

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

    const sliced = lines.slice(from - 1, to).join("\n");
    return warning ? { warning, content: sliced } : sliced;
}

export function getFileContentTool(workspace: Workspace): AgentTool {
    return {
        name: "get_file_content",
        description: [
            "Read file content from the workspace snapshot (PR head, or default-branch tip for issues).",
            "There is no base checkout — for before/after of a PR change, use get_file_diff first.",
            `At most ${FILE_CONTENT_MAX_LINES} lines per call. For files over ${FILE_CONTENT_MAX_LINES} lines use fromLine/toLine (1-based inclusive) to paginate.`,
            "Use this to: (1) read head context around a change, (2) trace caller/callee paths, (3) verify interface contracts.",
            "Do NOT read the whole repository — only files that validate a specific suspicion.",
            "filePath must be a file path only — not a directory.",
            UNTRUSTED_WARNING_TOOL_PROMPT,
        ].join(" "),
        untrustedResult: true,
        parameters: getFileContentInputSchema.toJSONSchema(),
        execute: async (args) => {
            const { filePath, fromLine, toLine } = getFileContentInputSchema.parse(args);
            try {
                const content = await workspace.read(filePath);
                return paginateLines(content, fromLine, toLine);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                if (message.startsWith("File not found")) {
                    return { error: message };
                }
                throw error;
            }
        },
    };
}
