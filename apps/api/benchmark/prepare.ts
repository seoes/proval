import { join } from "node:path";
import { loadManifest, type ManifestCase } from "./dataset.js";
import {
    WORK_DIR,
    addWorktree,
    computeDiffStat,
    ensureCacheRepo,
    ensureCommitWithMergeBase,
    git,
    mergeBase,
    removeWorktree,
} from "./git.js";

/**
 * Step 2. Verify every object and hash recorded in the manifest.
 * Preparation never refreshes commit identifiers. A mismatch or a missing
 * object fails instead of falling back to a moving branch.
 */
export async function prepareCase(entry: ManifestCase): Promise<void> {
    const repoDir = await ensureCacheRepo(entry.repoUrl);
    const startSha = await ensureCommitWithMergeBase(repoDir, entry.repoUrl, entry.baseSha, entry.headSha);
    if (startSha !== entry.startSha) {
        throw new Error(`${entry.caseId}: merge base ${startSha} does not match manifest startSha ${entry.startSha}`);
    }
    const recordedStart = await mergeBase(repoDir, entry.baseSha, entry.headSha);
    if (recordedStart !== entry.startSha) {
        throw new Error(`${entry.caseId}: startSha verification failed`);
    }
    const stat = await computeDiffStat(repoDir, entry.startSha, entry.headSha);
    if (stat.diffHash !== entry.diffHash) {
        throw new Error(`${entry.caseId}: diff hash mismatch`);
    }
    if (
        stat.addedLineCount !== entry.addedLineCount ||
        stat.deletedLineCount !== entry.deletedLineCount ||
        stat.changedFileCount !== entry.changedFileCount
    ) {
        throw new Error(`${entry.caseId}: diff stat mismatch`);
    }
}

export async function prepareAll(caseIdList?: string[]): Promise<void> {
    const manifest = await loadManifest();
    const targetList = caseIdList?.length
        ? manifest.caseList.filter((entry) => caseIdList.includes(entry.caseId))
        : manifest.caseList;
    if (targetList.length === 0) {
        throw new Error("no manifest case matched");
    }
    let done = 0;
    for (const entry of targetList) {
        await prepareCase(entry);
        done++;
        console.log(`prepared ${entry.caseId} (${done}/${targetList.length})`);
    }
    console.log(`prepare complete: ${done} cases verified`);
}

/** Create a fresh working directory for one run at the fixed head commit. */
export async function createCaseWorkdir(entry: ManifestCase, runId: string): Promise<string> {
    const repoDir = await ensureCacheRepo(entry.repoUrl);
    const dir = join(WORK_DIR, runId);
    await addWorktree(repoDir, dir, entry.headSha);
    const head = await git(["rev-parse", "HEAD"], dir);
    if (head !== entry.headSha) {
        await removeWorktree(repoDir, dir);
        throw new Error(`${entry.caseId}: workdir head ${head} does not match manifest headSha`);
    }
    return dir;
}

export async function removeCaseWorkdir(repoUrl: string, dir: string): Promise<void> {
    const repoDir = await ensureCacheRepo(repoUrl);
    await removeWorktree(repoDir, dir);
}
