/**
 * What changed in a merge request since the version Proval last reviewed.
 *
 * A rebase moves every hunk to a new line number and gives the diff a new base, but
 * leaves the hunk bodies untouched. New code does not. So the comparison is made on
 * hunk bodies only, keyed by path, after dropping the lines that a rebase rewrites: the
 * @@ header, the index line and the --- / +++ markers.
 *
 * This is the check a careful author runs by hand before asking for a re-review, and
 * on a stacked branch it is the difference between re-reviewing nine layers and two.
 */

/** One file's diff as a provider's "merge request version" endpoint returns it. */
export interface VersionDiff {
    old_path?: string | null;
    new_path?: string | null;
    diff?: string | null;
    renamed_file?: boolean;
}

/** Hunk bodies by path. */
export type NormalisedDiffs = Record<string, string>;

export interface VersionDelta {
    /** True when no hunk body differs: a rebase, or no push at all. */
    unchanged: boolean;
    added: string[];
    removed: string[];
    changed: string[];
    /** added + changed + removed, sorted: the files a later rule should classify. */
    touched: string[];
    /** Line counts of the delta itself, when the caller can supply them. */
    additions?: number;
    deletions?: number;
}

const REBASE_REWRITTEN_PREFIX_LIST = ["@@", "index ", "--- ", "+++ "];

export function normaliseVersionDiffs(diffList: VersionDiff[]): NormalisedDiffs {
    const out: NormalisedDiffs = {};
    for (const entry of diffList) {
        const path = entry.new_path || entry.old_path;
        if (!path) continue;
        const body = (entry.diff ?? "")
            .split("\n")
            .filter((line) => !REBASE_REWRITTEN_PREFIX_LIST.some((prefix) => line.startsWith(prefix)))
            .join("\n");
        out[path] = body;
    }
    return out;
}

export function compareVersionDiffs(before: NormalisedDiffs, after: NormalisedDiffs): VersionDelta {
    const beforePathSet = new Set(Object.keys(before));
    const afterPathSet = new Set(Object.keys(after));
    const added = [...afterPathSet].filter((path) => !beforePathSet.has(path)).sort();
    const removed = [...beforePathSet].filter((path) => !afterPathSet.has(path)).sort();
    const changed = [...afterPathSet].filter((path) => beforePathSet.has(path) && before[path] !== after[path]).sort();
    const touched = [...new Set([...added, ...removed, ...changed])].sort();
    return { unchanged: touched.length === 0, added, removed, changed, touched };
}

/**
 * Counts the lines a delta adds and deletes, from the hunk bodies of the files it
 * touched. Only files present in `after` contribute additions; only files present in
 * `before` contribute deletions, so a removed file counts as deletions and an added
 * file as additions.
 */
export function countDeltaLines(
    before: NormalisedDiffs,
    after: NormalisedDiffs,
    delta: VersionDelta,
): { additions: number; deletions: number } {
    let additions = 0;
    let deletions = 0;
    const lines = (body: string, sign: "+" | "-") => body.split("\n").filter((l) => l.startsWith(sign));
    // Lines of the new version's diff that the old version's did not have, per sign,
    // counted as a multiset so an in place rewrite that keeps the line count still
    // reads as churn rather than as nothing. Enough to tell a two line fix from a
    // two thousand line one.
    const newLines = (afterList: string[], beforeList: string[]) => {
        const seen = new Map<string, number>();
        for (const line of beforeList) seen.set(line, (seen.get(line) ?? 0) + 1);
        let fresh = 0;
        for (const line of afterList) {
            const left = seen.get(line) ?? 0;
            if (left > 0) seen.set(line, left - 1);
            else fresh++;
        }
        return fresh;
    };
    for (const path of delta.touched) {
        const beforeBody = before[path] ?? "";
        const afterBody = after[path] ?? "";
        additions += newLines(lines(afterBody, "+"), lines(beforeBody, "+"));
        deletions += newLines(lines(afterBody, "-"), lines(beforeBody, "-"));
    }
    return { additions, deletions };
}
