import { describe, expect, test } from "bun:test";
import { DEFAULT_TRIAGE_SETTINGS, triagePullRequest, type TriageInput } from "./rules.js";

const base: TriageInput = {
    title: "feat: add the thing",
    author: "alice",
    filePathList: ["src/thing.ts", "src/thing.test.ts"],
    additions: 120,
    deletions: 10,
    delta: null,
    settings: { smallDeltaLineCount: 60, allowSkip: true, mechanicalAuthorList: ["renovate-bot"] },
};

describe("triagePullRequest", () => {
    test("with no prior review and ordinary code, depth is normal and the reason says so", () => {
        const record = triagePullRequest(base);
        expect(record.depth).toBe("normal");
        expect(record.rule).toBe("default");
    });

    test("a delta that changed nothing since the last review is a skip", () => {
        const record = triagePullRequest({
            ...base,
            delta: { unchanged: true, added: [], removed: [], changed: [], touched: [] },
        });
        expect(record.depth).toBe("skip");
        expect(record.rule).toBe("rebase-only");
    });

    test("the default settings allow the rebase-only skip, since an unchanged delta has nothing to find", () => {
        const record = triagePullRequest({
            ...base,
            delta: { unchanged: true, added: [], removed: [], changed: [], touched: [] },
            settings: DEFAULT_TRIAGE_SETTINGS,
        });
        expect(record.depth).toBe("skip");
    });

    test("skip is downgraded to light when the repository does not allow skipping", () => {
        const record = triagePullRequest({
            ...base,
            delta: { unchanged: true, added: [], removed: [], changed: [], touched: [] },
            settings: { ...base.settings, allowSkip: false },
        });
        expect(record.depth).toBe("light");
        expect(record.rule).toBe("rebase-only");
    });

    test("when a delta exists, rules classify the delta's files, not the whole merge request", () => {
        // The merge request touches code, but everything since the last review is docs.
        const record = triagePullRequest({
            ...base,
            delta: { unchanged: false, added: [], removed: [], changed: ["README.md"], touched: ["README.md"] },
        });
        expect(record.depth).toBe("light");
        expect(record.rule).toBe("docs-only");
    });

    test("docs-only on a first review is light", () => {
        expect(triagePullRequest({ ...base, filePathList: ["README.md", "docs/guide.md"] }).rule).toBe("docs-only");
    });

    test("tests-only is light", () => {
        expect(triagePullRequest({ ...base, filePathList: ["tests/a.test.ts", "src/__tests__/b.ts"] }).rule).toBe(
            "tests-only",
        );
    });

    test("a small change is light, measured on the delta when there is one", () => {
        expect(triagePullRequest({ ...base, additions: 20, deletions: 5 }).rule).toBe("small-change");
        const bigMergeRequestSmallDelta = triagePullRequest({
            ...base,
            additions: 2000,
            deletions: 0,
            delta: {
                unchanged: false,
                added: [],
                removed: [],
                changed: ["src/thing.ts"],
                touched: ["src/thing.ts"],
                additions: 8,
                deletions: 2,
            },
        });
        expect(bigMergeRequestSmallDelta.rule).toBe("small-change");
    });

    test("a mechanical author is light, or skip where the repository allows it", () => {
        expect(triagePullRequest({ ...base, author: "renovate-bot" }).depth).toBe("light");
        expect(triagePullRequest({ ...base, author: "renovate-bot" }).rule).toBe("mechanical-author");
    });

    test("a mechanical title such as a dependency bump is light", () => {
        expect(triagePullRequest({ ...base, title: "chore(deps): bump vite from 5.0.1 to 5.0.2" }).rule).toBe(
            "mechanical-title",
        );
    });

    test("first match wins, in the documented order", () => {
        // docs-only AND small: docs-only is earlier in the order and is what gets reported.
        const record = triagePullRequest({ ...base, filePathList: ["README.md"], additions: 3, deletions: 0 });
        expect(record.rule).toBe("docs-only");
    });

    test("every record carries the inputs the decision rested on, so an operator can see why", () => {
        const record = triagePullRequest({ ...base, filePathList: ["README.md"] });
        expect(record.evidence.fileCount).toBe(1);
        expect(record.evidence.lineCount).toBe(130);
        expect(record.evidence.hadDelta).toBe(false);
    });

    test("anything not matched is normal with no evidence of a skip, never an error", () => {
        const record = triagePullRequest({ ...base, filePathList: [], additions: 0, deletions: 0 });
        expect(record.depth).toBe("normal");
    });
});
