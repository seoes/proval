import { mkdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";

export const DATA_DIR = resolve(process.env.BENCHMARK_DATA_DIR ?? join(import.meta.dir, "..", "data"));
export const CACHE_DIR = join(DATA_DIR, "cache");
export const WORK_DIR = join(DATA_DIR, "work");
export const OUTPUT_DIR = join(DATA_DIR, "output");

const SHA_PATTERN = /^[0-9a-f]{40}$/i;

export function isSha(value: string): boolean {
    return SHA_PATTERN.test(value);
}

export async function git(argList: string[], cwd?: string): Promise<string> {
    const proc = Bun.spawn(["git", ...argList], { cwd, stdout: "pipe", stderr: "pipe" });
    const [stdout, stderr, code] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
    ]);
    if (code !== 0) {
        throw new Error(`git ${argList[0]} failed (${code}): ${stderr || stdout}`);
    }
    return stdout.trim();
}

/** https://github.com/owner/repo.git -> owner__repo.git (also accepts file paths). */
export function cacheRepoPath(repoUrl: string): string {
    const cleaned = repoUrl.replace(/\/+$/, "").replace(/\.git$/, "");
    const segmentList = cleaned.split("/").filter(Boolean);
    const repo = segmentList[segmentList.length - 1] ?? "repo";
    const owner = segmentList[segmentList.length - 2] ?? "local";
    const safe = (value: string) => value.replace(/[^a-zA-Z0-9._-]/g, "_");
    return join(CACHE_DIR, `${safe(owner)}__${safe(repo)}.git`);
}

export async function ensureCacheRepo(repoUrl: string): Promise<string> {
    const dir = cacheRepoPath(repoUrl);
    await mkdir(CACHE_DIR, { recursive: true });
    try {
        await git(["rev-parse", "--is-bare-repository"], dir);
    } catch {
        await git(["init", "--bare", dir]);
    }
    // Source trees contain paths that exceed the default Windows path limit
    // once the workdir prefix is added. Worktrees share this config.
    await git(["config", "core.longpaths", "true"], dir);
    return dir;
}

async function hasCommit(repoDir: string, sha: string): Promise<boolean> {
    try {
        await git(["cat-file", "-e", `${sha}^{commit}`], repoDir);
        return true;
    } catch {
        return false;
    }
}

async function fetchSha(repoDir: string, repoUrl: string, sha: string, depth: number): Promise<void> {
    await git(["fetch", "--quiet", `--depth=${depth}`, repoUrl, sha], repoDir);
}

async function deepen(repoDir: string, repoUrl: string, shaList: string[], depth: number): Promise<void> {
    await git(["fetch", "--quiet", `--deepen=${depth}`, repoUrl, ...shaList], repoDir);
}

export async function mergeBase(repoDir: string, aSha: string, bSha: string): Promise<string | null> {
    try {
        return await git(["merge-base", aSha, bSha], repoDir);
    } catch {
        return null;
    }
}

/**
 * Make both commits and their common ancestor available in the cache repo.
 * GitHub serves reachable commits by SHA, so no branch ref is needed.
 */
export async function ensureCommitWithMergeBase(
    repoDir: string,
    repoUrl: string,
    baseSha: string,
    headSha: string,
): Promise<string> {
    for (const sha of [baseSha, headSha]) {
        if (!(await hasCommit(repoDir, sha))) {
            await fetchSha(repoDir, repoUrl, sha, 1);
        }
    }

    let startSha = await mergeBase(repoDir, baseSha, headSha);
    let depth = 200;
    const maxRound = 8;
    for (let round = 0; !startSha && round < maxRound; round++) {
        await deepen(repoDir, repoUrl, [baseSha, headSha], depth);
        startSha = await mergeBase(repoDir, baseSha, headSha);
        depth *= 4;
    }
    if (!startSha) {
        throw new Error(`no merge base found between ${baseSha} and ${headSha}`);
    }
    return startSha;
}

export type DiffStat = {
    addedLineCount: number;
    deletedLineCount: number;
    changedFileCount: number;
    binaryFileCount: number;
    diffHash: string;
};

async function hashDiff(repoDir: string, startSha: string, headSha: string): Promise<string> {
    // full index keeps abbreviated blob ids out of the hash. Abbreviation
    // length changes as the cache repo accumulates more objects.
    const proc = Bun.spawn(["git", "diff", "--full-index", "-M", startSha, headSha], {
        cwd: repoDir,
        stdout: "pipe",
        stderr: "pipe",
    });
    const hash = createHash("sha256");
    const reader = proc.stdout.getReader();
    try {
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            hash.update(value);
        }
    } finally {
        await reader.cancel().catch(() => {});
    }
    const [stderr, code] = await Promise.all([new Response(proc.stderr).text(), proc.exited]);
    if (code !== 0) {
        throw new Error(`git diff failed (${code}): ${stderr}`);
    }
    return hash.digest("hex");
}

export async function computeDiffStat(repoDir: string, startSha: string, headSha: string): Promise<DiffStat> {
    const numstat = await git(["diff", "--numstat", "-M", startSha, headSha], repoDir);
    let addedLineCount = 0;
    let deletedLineCount = 0;
    let changedFileCount = 0;
    let binaryFileCount = 0;
    for (const line of numstat.split("\n").filter(Boolean)) {
        const [added, deleted] = line.split("\t");
        changedFileCount++;
        if (added === "-" || deleted === "-") {
            binaryFileCount++;
            continue;
        }
        addedLineCount += Number.parseInt(added ?? "0", 10) || 0;
        deletedLineCount += Number.parseInt(deleted ?? "0", 10) || 0;
    }
    const diffHash = await hashDiff(repoDir, startSha, headSha);
    return { addedLineCount, deletedLineCount, changedFileCount, binaryFileCount, diffHash };
}

/** Create a fresh working directory checked out at the given commit. */
export async function addWorktree(repoDir: string, dir: string, sha: string): Promise<void> {
    await rm(dir, { recursive: true, force: true });
    await mkdir(join(dir, ".."), { recursive: true });
    await git(["worktree", "add", "--detach", dir, sha], repoDir);
}

export async function removeWorktree(repoDir: string, dir: string): Promise<void> {
    try {
        await git(["worktree", "remove", "--force", dir], repoDir);
    } catch {
        await rm(dir, { recursive: true, force: true });
        await git(["worktree", "prune"], repoDir).catch(() => {});
    }
}
