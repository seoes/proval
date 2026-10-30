import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { CommonLogEntry, ToolCallLogEntry, ToolErrorLogEntry, ToolResultLogEntry } from "@proval/types";
import { messageHtml, serializeActivityLogList } from "./activity-log.js";

const common: CommonLogEntry = {
    type: "common",
    timestamp: "2026-10-06T10:00:00.000Z",
    level: "info",
    label: "Plan",
    message: "Starting review",
};

function toolCall(toolCallId: string, label = "Plan"): ToolCallLogEntry {
    return { ...common, type: "tool-call", toolName: "get_file_diff", toolCallId, label, message: '{"path":"app.ts"}' };
}

function toolResult(call: ToolCallLogEntry): ToolResultLogEntry {
    return { ...call, type: "tool-result", message: `Result for ${call.toolCallId}` };
}

describe("serializeActivityLogList", () => {
    test("pairs concurrent calls by execution ID and keeps call order before label filtering", () => {
        const first = toolCall("first", "Unit 1");
        const second = toolCall("second", "Unit 2");
        const firstResult = toolResult(first);
        const secondResult = toolResult(second);
        const rowList = serializeActivityLogList([common, first, second, secondResult, common, firstResult]);

        assert.deepEqual(
            rowList.map((row) => row.entry),
            [common, first, second, common],
        );
        assert.deepEqual(
            rowList.map((row) => row.key),
            [0, 1, 2, 4],
        );
        assert.equal(rowList[1]?.result, firstResult);
        assert.equal(rowList[2]?.result, secondResult);
        assert.equal(rowList.filter((row) => row.entry.label === "Unit 2")[0]?.result, secondResult);
    });

    test("pairs results even when they precede the call in the response", () => {
        const call = toolCall("first");
        const result = toolResult(call);
        const rowList = serializeActivityLogList([result, call]);
        assert.equal(rowList.length, 1);
        assert.equal(rowList[0]?.key, 1);
        assert.equal(rowList[0]?.entry, call);
        assert.equal(rowList[0]?.result, result);
    });

    test("keeps row identity when a pending call receives its result on the next poll", () => {
        const call = Object.freeze(toolCall("pending"));
        const initialLogList = Object.freeze([common, call]);
        const initialRowList = serializeActivityLogList(initialLogList);
        const result = toolResult(call);
        const nextRowList = serializeActivityLogList([...initialLogList, result]);

        assert.equal(initialRowList[1]?.result, undefined);
        assert.equal(nextRowList[1]?.key, initialRowList[1]?.key);
        assert.equal(nextRowList[1]?.result, result);
        assert.equal(Object.hasOwn(call, "result"), false);
    });

    test("keeps tool errors as independent rows without attaching them as results", () => {
        const call = toolCall("failed");
        const error: ToolErrorLogEntry = { ...call, type: "tool-error", level: "error", message: "Tool failed" };
        const rowList = serializeActivityLogList([call, error, common]);

        assert.deepEqual(
            rowList.map((row) => row.entry),
            [call, error, common],
        );
        assert.equal(
            rowList.every((row) => row.result === undefined),
            true,
        );
    });

    test("only displays results under a matching call", () => {
        const call = toolCall("first");
        const wrongTool = { ...toolResult(call), toolName: "get_file_content" };
        const orphan = toolResult(toolCall("missing"));
        const rowList = serializeActivityLogList([call, wrongTool, orphan]);

        assert.equal(rowList.length, 1);
        assert.equal(rowList[0]?.entry, call);
        assert.equal(rowList[0]?.result, undefined);
        assert.deepEqual(serializeActivityLogList([]), []);
    });

    test("highlights only tool call arguments using the JSON grammar", () => {
        const call = toolCall("highlight");
        const [commonRow, callRow] = serializeActivityLogList([common, call, toolResult(call)]);
        assert.ok(callRow);
        assert.equal(commonRow?.argumentHtml, "");
        assert.match(callRow.argumentHtml, /class="hljs-attr">&quot;path&quot;/);
        assert.match(callRow.argumentHtml, /class="hljs-string">&quot;app.ts&quot;/);
    });

    test("highlights nested JSON while preserving whitespace and numeric spelling", () => {
        const message = '{\n  "path": "src/app.ts", "option": [true, false, null, -1.20e+3, 9007199254740993]\n}';
        const call = { ...toolCall("nested"), message };
        const [row] = serializeActivityLogList([call]);

        assert.ok(row);
        assert.equal(row.entry.message, message);
        assert.match(row.argumentHtml, /\n {2}/);
        assert.match(row.argumentHtml, /class="hljs-number">-1.20e\+3</);
        assert.match(row.argumentHtml, /class="hljs-number">9007199254740993</);
    });

    test("escapes HTML in arguments before rendering the highlighter output", () => {
        const message = JSON.stringify({ body: '<script>alert(true)</script><img src=x onerror="alert(1)">&' });
        const [row] = serializeActivityLogList([{ ...toolCall("escaped"), message }]);

        assert.ok(row);
        assert.match(row.argumentHtml, /&lt;script&gt;/);
        assert.match(row.argumentHtml, /&lt;img /);
        assert.match(row.argumentHtml, /&amp;/);
        assert.doesNotMatch(row.argumentHtml, /<(script|img)\b/i);
        assert.equal(row.entry.message, message);
    });

    test("preserves truncated strings and a trailing escape without throwing", () => {
        for (const message of ['{"body":"unfinished true 123…', '{"body":"unfinished\\', '{"count":1e', "", "{}"]) {
            const [row] = serializeActivityLogList([{ ...toolCall("partial"), message }]);
            assert.equal(row?.entry.message, message);
            assert.equal(typeof row?.argumentHtml, "string");
            if (message) assert.notEqual(row?.argumentHtml, "");
        }
    });

    test("pretty prints JSON tool results and skips truncated JSON", () => {
        const call = toolCall("json-result");
        const [row] = serializeActivityLogList([
            call,
            { ...toolResult(call), message: '{"ok":true,"count":2}' },
        ]);
        assert.match(row?.resultHtml ?? "", /hljs-attr/);
        assert.match(row?.resultHtml ?? "", /&quot;count&quot;/);
        assert.match(row?.resultHtml ?? "", /\n    <span class="hljs-attr">/);

        const [cut] = serializeActivityLogList([call, { ...toolResult(call), message: '{"ok":true…' }]);
        assert.equal(cut?.resultHtml, undefined);
    });

    test("messageHtml highlights get_file_content source from filePath", () => {
        const html = messageHtml("export const n = 1;\n", "src/app.ts");
        assert.match(html ?? "", /hljs-keyword/);
        assert.equal(messageHtml("export const n = 1;\n", "src/App.svelte"), undefined);
    });
});
