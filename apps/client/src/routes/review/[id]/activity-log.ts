import type { ActivityLogEntry, ToolResultLogEntry } from "@proval/types";
import hljs from "highlight.js/lib/common";

const CODE_HIGHLIGHT_CLASS =
    "whitespace-pre-wrap [&_.hljs-attr]:text-primary-text [&_.hljs-built_in]:text-violet-700 dark:[&_.hljs-built_in]:text-violet-300 [&_.hljs-comment]:text-muted-foreground [&_.hljs-keyword]:text-primary-text [&_.hljs-literal]:text-violet-700 dark:[&_.hljs-literal]:text-violet-300 [&_.hljs-number]:text-warning [&_.hljs-punctuation]:text-secondary-foreground [&_.hljs-string]:text-success [&_.hljs-title]:text-primary-text [&_.hljs-type]:text-violet-700 dark:[&_.hljs-type]:text-violet-300";

export { CODE_HIGHLIGHT_CLASS };

export function messageHtml(message: string, filePath?: string): string | undefined {
    const trimmed = message.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
        try {
            const value = JSON.parse(trimmed) as unknown;
            if (value !== null && typeof value === "object") {
                return hljs.highlight(JSON.stringify(value, null, 4), {
                    language: "json",
                    ignoreIllegals: true,
                }).value;
            }
        } catch {
            if (!filePath) return undefined;
        }
    }

    const ext = filePath?.split("/").pop()?.split(".").pop()?.toLowerCase();
    if (!ext || !hljs.getLanguage(ext)) return undefined;
    try {
        return hljs.highlight(message, { language: ext, ignoreIllegals: true }).value;
    } catch {
        return undefined;
    }
}

export interface ActivityLogRow {
    key: number;
    entry: Exclude<ActivityLogEntry, ToolResultLogEntry>;
    result?: ToolResultLogEntry;
    argumentHtml: string;
    resultHtml?: string;
}

export function serializeActivityLogList(logList: readonly ActivityLogEntry[]): ActivityLogRow[] {
    const resultByCallId = new Map<string, ToolResultLogEntry>();
    for (const entry of logList) {
        if (entry.type === "tool-result") {
            resultByCallId.set(entry.toolCallId, entry);
        }
    }

    const rowList: ActivityLogRow[] = [];
    for (const [index, entry] of logList.entries()) {
        if (entry.type === "tool-result") continue;

        const result = entry.type === "tool-call" ? resultByCallId.get(entry.toolCallId) : undefined;
        const matchedResult =
            entry.type === "tool-call" && result?.toolName === entry.toolName ? result : undefined;
        let filePath: string | undefined;
        if (entry.type === "tool-call" && entry.toolName === "get_file_content") {
            try {
                const args = JSON.parse(entry.message) as { filePath?: unknown };
                if (typeof args.filePath === "string") filePath = args.filePath;
            } catch {
                /* invalid call args */
            }
        }

        rowList.push({
            key: index,
            entry,
            result: matchedResult,
            argumentHtml:
                entry.type === "tool-call"
                    ? hljs.highlight(entry.message, { language: "json", ignoreIllegals: true }).value
                    : "",
            resultHtml: matchedResult ? messageHtml(matchedResult.message, filePath) : undefined,
        });
    }
    return rowList;
}
