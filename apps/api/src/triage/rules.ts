import type { VersionDelta } from "./delta.js";

/**
 * Decides how deep a review should be before any model token is spent.
 *
 * Rules run in a fixed order and the first that matches wins; the order is the
 * priority. Every outcome, including "nothing matched", produces a record with the
 * rule that fired and the evidence it rested on, so an operator can read why a review
 * ran at the depth it did. Nothing in here can throw: an input the rules do not
 * understand is "normal", which is today's behaviour.
 *
 * When a delta since the last reviewed version is supplied, the rules classify the
 * delta rather than the whole merge request. That is what makes them right on a
 * stacked branch, where the merge request is large and the change since the last
 * review is often nothing.
 */

export type TriageDepth = "skip" | "light" | "normal";

export type TriageRule =
    | "rebase-only"
    | "docs-only"
    | "tests-only"
    | "small-change"
    | "mechanical-author"
    | "mechanical-title"
    | "default";

export interface TriageSettings {
    /** A delta with no more lines than this is a light review. */
    smallDeltaLineCount: number;
    /**
     * Whether a rule may skip a review outright; otherwise skip is downgraded to light.
     * Only rebase-only produces a skip, and a delta with no changed hunk cannot carry a
     * new finding, so the default is on. Off is for an instance that wants a note on
     * every push regardless.
     */
    allowSkip: boolean;
    /** Author usernames whose changes are mechanical: bots and release tooling. */
    mechanicalAuthorList: string[];
}

export interface TriageInput {
    title: string;
    author: string;
    /** Every path the merge request changes. */
    filePathList: string[];
    additions: number;
    deletions: number;
    /** Change since the last reviewed version, or null on a first review. */
    delta: VersionDelta | null;
    settings: TriageSettings;
}

export interface TriageRecord {
    depth: TriageDepth;
    rule: TriageRule;
    /** One sentence a person can read in the dashboard. */
    reason: string;
    evidence: {
        hadDelta: boolean;
        fileCount: number;
        lineCount: number;
        /** The files the rules looked at: the delta's when there was one, else all. */
        filePathList: string[];
    };
}

export const DEFAULT_TRIAGE_SETTINGS: TriageSettings = {
    smallDeltaLineCount: 60,
    allowSkip: true,
    mechanicalAuthorList: ["renovate", "renovate-bot", "dependabot", "dependabot[bot]", "github-actions[bot]"],
};

const DOC_EXTENSION_LIST = [".md", ".mdx", ".txt", ".rst", ".adoc"];
const DOC_DIRECTORY_LIST = ["docs/", "doc/", "documentation/"];
const TEST_PATH_HINT_LIST = ["test", "spec", "__tests__", "__snapshots__", "fixtures"];
const MECHANICAL_TITLE_PATTERN =
    /^(chore|build|ci)\((deps|dependencies|release|vendor)\)|^(bump|re-?vendor|update dependenc|release v?\d)/i;

function isDocPath(path: string): boolean {
    const lower = path.toLowerCase();
    return (
        DOC_EXTENSION_LIST.some((ext) => lower.endsWith(ext)) ||
        DOC_DIRECTORY_LIST.some((dir) => lower.startsWith(dir) || lower.includes("/" + dir))
    );
}

function isTestPath(path: string): boolean {
    const lower = path.toLowerCase();
    return TEST_PATH_HINT_LIST.some((hint) => lower.includes(hint));
}

export function triagePullRequest(input: TriageInput): TriageRecord {
    const { settings } = input;
    const hadDelta = input.delta !== null;
    const filePathList = hadDelta ? input.delta!.touched : input.filePathList;
    const additions = hadDelta && input.delta!.additions !== undefined ? input.delta!.additions : input.additions;
    const deletions = hadDelta && input.delta!.deletions !== undefined ? input.delta!.deletions : input.deletions;
    const lineCount = additions + deletions;
    const evidence = { hadDelta, fileCount: filePathList.length, lineCount, filePathList };

    const decide = (depth: TriageDepth, rule: TriageRule, reason: string): TriageRecord => {
        // A skip that the repository does not allow becomes a light review, keeping the
        // rule so the record still says what was found.
        const effectiveDepth = depth === "skip" && !settings.allowSkip ? "light" : depth;
        return { depth: effectiveDepth, rule, reason, evidence };
    };

    // 1. Nothing new since the last review.
    if (hadDelta && input.delta!.unchanged) {
        return decide(
            "skip",
            "rebase-only",
            "no hunk changed since the last reviewed version; the branch was rebased or not pushed",
        );
    }

    // Rules 2 to 6 need something to look at. An empty file list is "normal", never a
    // confident decision, because it usually means the provider gave us nothing.
    if (filePathList.length > 0) {
        // 2. Only documentation.
        if (filePathList.every(isDocPath)) {
            return decide(
                "light",
                "docs-only",
                hadDelta
                    ? "every file changed since the last review is documentation"
                    : "every changed file is documentation",
            );
        }
        // 3. Only tests.
        if (filePathList.every(isTestPath)) {
            return decide(
                "light",
                "tests-only",
                hadDelta ? "every file changed since the last review is a test" : "every changed file is a test",
            );
        }
        // 4. Small.
        if (lineCount > 0 && lineCount <= settings.smallDeltaLineCount) {
            return decide(
                "light",
                "small-change",
                `${lineCount} changed lines is under the ${settings.smallDeltaLineCount} line threshold`,
            );
        }
    }

    // 5. A bot or release tool wrote it.
    if (settings.mechanicalAuthorList.some((name) => name.toLowerCase() === input.author.toLowerCase())) {
        return decide("light", "mechanical-author", `author ${input.author} is listed as mechanical`);
    }

    // 6. The title says it is mechanical.
    if (MECHANICAL_TITLE_PATTERN.test(input.title.trim())) {
        return decide("light", "mechanical-title", "the title describes a dependency bump, release or re-vendoring");
    }

    // 7. Everything else is a normal review, which is today's behaviour.
    return { depth: "normal", rule: "default", reason: "no triage rule matched", evidence };
}
