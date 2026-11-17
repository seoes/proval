import { describe, expect, test } from "bun:test";
import { formatValue, render, renderNdjson, renderOne, renderTable, type Column } from "./output.js";

interface Row {
    id: number;
    path: string;
    enabled: boolean;
}

const rowList: Row[] = [
    { id: 1, path: "group/short", enabled: true },
    { id: 23, path: "group/a-much-longer-project", enabled: false },
];

const columnList: Column<Row>[] = [
    { header: "id", value: (r) => String(r.id), numeric: true },
    { header: "path", value: (r) => r.path },
    { header: "review", value: (r) => formatValue(r.enabled) },
];

describe("renderTable", () => {
    test("sizes every column to its widest cell, so nothing is truncated", () => {
        const lineList = renderTable(rowList, columnList).split("\n");
        expect(lineList[1]).toContain("group/short");
        expect(lineList[2]).toContain("group/a-much-longer-project");
    });

    test("right aligns numeric columns so digits line up", () => {
        const lineList = renderTable(rowList, columnList).split("\n");
        // "1" is padded to the width of "23".
        expect(lineList[1]!.startsWith(" 1")).toBe(true);
        expect(lineList[2]!.startsWith("23")).toBe(true);
    });

    test("leaves no trailing whitespace on any line", () => {
        for (const line of renderTable(rowList, columnList).split("\n")) {
            expect(line).toBe(line.trimEnd());
        }
    });

    test("returns empty for no rows rather than a lone header", () => {
        expect(renderTable([], columnList)).toBe("");
    });
});

describe("renderNdjson", () => {
    test("writes one object per line with no wrapping array", () => {
        const lineList = renderNdjson(rowList).split("\n");
        expect(lineList).toHaveLength(2);
        expect(JSON.parse(lineList[0]!)).toEqual(rowList[0] as unknown as Record<string, unknown>);
    });

    test("produces nothing for an empty list, so a consumer reads zero lines", () => {
        expect(renderNdjson([])).toBe("");
    });
});

describe("render", () => {
    test("json mode is parseable as one document", () => {
        expect(JSON.parse(render("json", rowList, columnList))).toHaveLength(2);
    });

    test("agent mode is parseable line by line", () => {
        const lineList = render("agent", rowList, columnList).split("\n");
        expect(lineList.every((line) => typeof JSON.parse(line) === "object")).toBe(true);
    });

    test("table mode is not valid json, which is the point of having modes", () => {
        expect(() => JSON.parse(render("table", rowList, columnList))).toThrow();
    });
});

describe("formatValue", () => {
    test("renders booleans as words a person reads, not as true and false", () => {
        expect(formatValue(true)).toBe("yes");
        expect(formatValue(false)).toBe("no");
    });

    test("renders absent values as empty rather than as the word null", () => {
        expect(formatValue(null)).toBe("");
        expect(formatValue(undefined)).toBe("");
    });
});

describe("renderOne", () => {
    test("agent mode emits a single line", () => {
        expect(renderOne("agent", { id: 1, path: "a/b" }).split("\n")).toHaveLength(1);
    });

    test("table mode lists one field per line", () => {
        expect(renderOne("table", { id: 1, path: "a/b" })).toBe("id: 1\npath: a/b");
    });
});
