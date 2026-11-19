import { describe, expect, test } from "bun:test";
import { DEFAULT_TRIAGE_SETTINGS, isGeneratedPath, triagePullRequest, type TriageInput } from "./rules.js";

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

describe("generated files", () => {
    test("lockfiles, changelogs, changesets, assets and build output are generated", () => {
        for (const path of [
            "package-lock.json",
            "packages/core/pnpm-lock.yaml",
            "composer.lock",
            "packages/core/CHANGELOG.md",
            "CHANGELOG",
            ".changeset/core-on-nuxt-4.md",
            "packages/core/banner.svg",
            "dist/index.js",
            "src/__snapshots__/a.test.ts.snap",
        ]) {
            expect(isGeneratedPath(path)).toBe(true);
        }
    });

    test("source, config and ordinary docs are not generated", () => {
        for (const path of ["src/module.ts", "package.json", "README.md", "docs/changes.md", ".gitlab-ci.yml"]) {
            expect(isGeneratedPath(path)).toBe(false);
        }
    });

    test("a change of only generated files is light", () => {
        const record = triagePullRequest({
            ...base,
            filePathList: ["pnpm-lock.yaml", "packages/core/CHANGELOG.md", ".changeset/a.md"],
            additions: 900,
            deletions: 400,
        });
        expect(record.depth).toBe("light");
        expect(record.rule).toBe("generated-only");
    });

    test("generated files do not stop a docs-only change from being docs-only", () => {
        const record = triagePullRequest({
            ...base,
            filePathList: ["README.md", "packages/core/CHANGELOG.md", "pnpm-lock.yaml"],
            additions: 400,
            deletions: 0,
        });
        expect(record.rule).toBe("docs-only");
    });

    test("generated files do not hide real code", () => {
        const record = triagePullRequest({ ...base, filePathList: ["src/thing.ts", "pnpm-lock.yaml"] });
        expect(record.depth).toBe("normal");
    });

    test("the default small change threshold is 150 lines", () => {
        expect(DEFAULT_TRIAGE_SETTINGS.smallDeltaLineCount).toBe(150);
    });
});

