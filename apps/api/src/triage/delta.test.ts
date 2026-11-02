import { describe, expect, test } from "bun:test";
import { compareVersionDiffs, normaliseVersionDiffs, type VersionDiff, countDeltaLines } from "./delta.js";

// A hunk's body is the same whether the file sits at line 10 or line 40 of a rebased
// branch. Only the @@ header and the index line change, so those are what we drop.
const hunkAt = (start: number, body: string) => `@@ -${start},3 +${start},4 @@\n${body}`;

const file = (path: string, diff: string, extra: Partial<VersionDiff> = {}): VersionDiff => ({
    old_path: path,
    new_path: path,
    diff,
    ...extra,
});

describe("normaliseVersionDiffs", () => {
    test("drops hunk headers and index lines, keeps the hunk bodies", () => {
        const diffs = [
            file("src/a.ts", "index abc..def 100644\n--- a/src/a.ts\n+++ b/src/a.ts\n" + hunkAt(10, " a\n-b\n+c\n d")),
        ];
        expect(normaliseVersionDiffs(diffs)).toEqual({ "src/a.ts": " a\n-b\n+c\n d" });
    });

    test("keys a renamed file by its new path", () => {
        const diffs = [file("old.ts", hunkAt(1, "+x"), { new_path: "new.ts", renamed_file: true })];
        expect(Object.keys(normaliseVersionDiffs(diffs))).toEqual(["new.ts"]);
    });

    test("tolerates a missing diff body, which the API returns for binary files", () => {
        expect(normaliseVersionDiffs([file("img.png", "")])).toEqual({ "img.png": "" });
    });
});

describe("compareVersionDiffs", () => {
    test("a rebase that moves every hunk but changes no body is reported as unchanged", () => {
        const before = normaliseVersionDiffs([
            file("src/a.ts", hunkAt(10, " a\n+b")),
            file("src/b.ts", hunkAt(5, "-c\n+d")),
        ]);
        const after = normaliseVersionDiffs([
            file("src/a.ts", hunkAt(42, " a\n+b")),
            file("src/b.ts", hunkAt(77, "-c\n+d")),
        ]);
        const delta = compareVersionDiffs(before, after);
        expect(delta.unchanged).toBe(true);
        expect(delta.added).toEqual([]);
        expect(delta.removed).toEqual([]);
        expect(delta.changed).toEqual([]);
    });

    test("new code in an existing file is reported as changed", () => {
        const before = normaliseVersionDiffs([file("src/a.ts", hunkAt(10, " a\n+b"))]);
        const after = normaliseVersionDiffs([file("src/a.ts", hunkAt(10, " a\n+b\n+c"))]);
        const delta = compareVersionDiffs(before, after);
        expect(delta.unchanged).toBe(false);
        expect(delta.changed).toEqual(["src/a.ts"]);
    });

    test("files that appear or disappear are listed by name, sorted", () => {
        const before = normaliseVersionDiffs([file("z.ts", "+1"), file("gone.ts", "+2")]);
        const after = normaliseVersionDiffs([file("z.ts", "+1"), file("a.ts", "+3"), file("b.ts", "+4")]);
        const delta = compareVersionDiffs(before, after);
        expect(delta.added).toEqual(["a.ts", "b.ts"]);
        expect(delta.removed).toEqual(["gone.ts"]);
        expect(delta.unchanged).toBe(false);
    });

    test("the delta's file list is what later rules classify, so it names only what moved", () => {
        const before = normaliseVersionDiffs([file("src/a.ts", "+1"), file("README.md", "+old")]);
        const after = normaliseVersionDiffs([file("src/a.ts", "+1"), file("README.md", "+new")]);
        expect(compareVersionDiffs(before, after).touched).toEqual(["README.md"]);
    });

    test("countDeltaLines counts churn, so an in place rewrite that keeps the line count is not zero", () => {
        const before = { "src/a.ts": "+const a = 1;\n+const b = 2;\n-const old = 0;" };
        const after = { "src/a.ts": "+const a = 10;\n+const b = 2;\n-const older = 0;" };
        const delta = { unchanged: false, added: [], removed: [], changed: ["src/a.ts"], touched: ["src/a.ts"] };
        expect(countDeltaLines(before, after, delta)).toEqual({ additions: 1, deletions: 1 });
    });
});
