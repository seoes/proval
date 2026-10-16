import type { GitProvider } from "../git-provider/types.js";
import type { VersionDelta } from "./delta.js";

/** The current version of a merge request, reduced to what triage needs. */
export interface PullRequestVersionSummary {
    headSha: string;
    filePathList: string[];
    additions: number;
    deletions: number;
}

/**
 * A provider that can say what changed in a merge request since a given head.
 *
 * Kept as an optional capability rather than a method on GitProvider, so a provider
 * without a versions API (GitHub and Forgejo today) needs no stub and triage simply
 * runs without a delta there, which is the first-review behaviour.
 */
export interface VersionDeltaCapable {
    fetchPullRequestVersionSummary(prIid: number): Promise<PullRequestVersionSummary>;
    /** Null when the reviewed head is not among the merge request's versions. */
    fetchPullRequestVersionDelta(prIid: number, reviewedHeadSha: string): Promise<VersionDelta | null>;
}

export function hasVersionDelta(provider: GitProvider): provider is GitProvider & VersionDeltaCapable {
    const candidate = provider as Partial<VersionDeltaCapable>;
    return (
        typeof candidate.fetchPullRequestVersionDelta === "function" &&
        typeof candidate.fetchPullRequestVersionSummary === "function"
    );
}
