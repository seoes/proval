import { rm } from "node:fs/promises";
import { join } from "node:path";
import { WORK_DIR, ensureCacheRepo, removeWorktree } from "../load/git.js";

export async function removeCaseWorkdir(repoUrl: string, dir: string): Promise<void> {
    const repoDir = await ensureCacheRepo(repoUrl);
    await removeWorktree(repoDir, dir);
}

/** The parent removes the workdir and database only after the child has exited. */
export async function cleanupAttempt(repoUrl: string, runId: string, batchDir: string): Promise<void> {
    try {
        await removeCaseWorkdir(repoUrl, join(WORK_DIR, runId));
    } catch {
        await rm(join(WORK_DIR, runId), { recursive: true, force: true }).catch(() => {});
    }
    await rm(join(batchDir, "tmp", `${runId}.db`), { force: true }).catch(() => {});
    await rm(join(batchDir, "tmp", `${runId}.db-journal`), { force: true }).catch(() => {});
}
