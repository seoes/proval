import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
    WORK_DIR,
    addWorktree,
    computeDiffStat,
    ensureCacheRepo,
    ensureCommitWithMergeBase,
    git,
    isSha,
    mergeBase,
    removeWorktree,
} from "./git.js";
import type { Manifest, ManifestCase } from "./types.js";

export const MANIFEST_PATH = resolve(process.env.BENCHMARK_MANIFEST_PATH ?? join(import.meta.dir, "manifest.json"));
export const MANIFEST_SCHEMA_VERSION = 1;

export function validateManifest(manifest: Manifest): void {
    if (manifest.schemaVersion !== MANIFEST_SCHEMA_VERSION) {
        throw new Error(`Unsupported manifest schemaVersion ${manifest.schemaVersion}`);
    }
    if (!isSha(manifest.datasetCommit)) {
        throw new Error("manifest datasetCommit is missing or invalid");
    }
    if (!Array.isArray(manifest.caseList) || manifest.caseList.length === 0) {
        throw new Error("manifest caseList is empty");
    }
    const caseIdSet = new Set<string>();
    const sourceUrlSet = new Set<string>();
    for (const entry of manifest.caseList) {
        if (caseIdSet.has(entry.caseId)) {
            throw new Error(`duplicate caseId ${entry.caseId}`);
        }
        caseIdSet.add(entry.caseId);
        if (sourceUrlSet.has(entry.sourceUrl)) {
            throw new Error(`duplicate sourceUrl ${entry.sourceUrl}`);
        }
        sourceUrlSet.add(entry.sourceUrl);
        for (const [field, sha] of [
            ["baseSha", entry.baseSha],
            ["startSha", entry.startSha],
            ["headSha", entry.headSha],
        ] as const) {
            if (!sha || !isSha(sha)) {
                throw new Error(`${entry.caseId}: missing or invalid ${field}`);
            }
        }
        if (!entry.diffHash) {
            throw new Error(`${entry.caseId}: missing diffHash`);
        }
    }
}

export async function loadManifest(path: string = MANIFEST_PATH): Promise<Manifest> {
    const manifest = JSON.parse(await readFile(path, "utf-8")) as Manifest;
    validateManifest(manifest);
    return manifest;
}

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
