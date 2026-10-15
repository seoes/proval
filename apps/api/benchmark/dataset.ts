import { readFile, readdir, writeFile, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { computeDiffStat, ensureCacheRepo, ensureCommitWithMergeBase, git, isSha } from "./git.js";

export const MANIFEST_PATH = resolve(process.env.BENCHMARK_MANIFEST_PATH ?? join(import.meta.dir, "manifest.json"));
export const MANIFEST_SCHEMA_VERSION = 1;

export type ManifestCase = {
    caseId: string;
    project: string;
    sourceUrl: string;
    repoUrl: string;
    prNumber: number;
    title: string;
    body: string;
    baseSha: string;
    startSha: string;
    headSha: string;
    addedLineCount: number;
    deletedLineCount: number;
    changedFileCount: number;
    binaryFileCount: number;
    diffHash: string;
};

export type ManifestUnavailable = {
    sourceUrl: string;
    reason: string;
};

export type Manifest = {
    schemaVersion: number;
    datasetCommit: string;
    importedAt: string;
    caseList: ManifestCase[];
    unavailableList: ManifestUnavailable[];
};

type GoldenEntry = {
    pr_title?: string;
    url?: string;
};

type GithubPr = {
    title: string;
    body: string | null;
    base: { sha: string };
    head: { sha: string; repo: { full_name: string } | null };
};

function parsePrUrl(url: string): { owner: string; repo: string; prNumber: number } | null {
    const match = /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/.exec(url.trim());
    if (!match) return null;
    return { owner: match[1]!, repo: match[2]!, prNumber: Number.parseInt(match[3]!, 10) };
}

async function fetchGithubPr(owner: string, repo: string, prNumber: number, token: string | null): Promise<GithubPr> {
    const headerList: Record<string, string> = {
        Accept: "application/vnd.github+json",
        "User-Agent": "proval-benchmark",
    };
    if (token) {
        headerList.Authorization = `Bearer ${token}`;
    }
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`, {
        headers: headerList,
    });
    if (!response.ok) {
        throw new Error(`GitHub API ${response.status} for ${owner}/${repo}#${prNumber}`);
    }
    return (await response.json()) as GithubPr;
}

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
 * Step 1. Read the golden comment files of a pinned Martian dataset commit,
 * resolve every source PR into fixed commit identifiers and write the
 * versioned manifest. Golden comments themselves are never copied anywhere.
 */
export async function importDataset(martianDir: string, token: string | null): Promise<Manifest> {
    const goldenDir = join(martianDir, "offline", "golden_comments");
    const datasetCommit = await git(["rev-parse", "HEAD"], martianDir);

    const fileList = (await readdir(goldenDir)).filter((name) => name.endsWith(".json")).sort();
    if (fileList.length === 0) {
        throw new Error(`no golden comment files under ${goldenDir}`);
    }

    const sourceList: { project: string; sourceUrl: string; title: string }[] = [];
    const seenUrlSet = new Set<string>();
    for (const file of fileList) {
        const project = file.replace(/\.json$/, "");
        const entryList = JSON.parse(await readFile(join(goldenDir, file), "utf-8")) as GoldenEntry[];
        for (const entry of entryList) {
            const url = entry.url?.trim();
            if (!url) continue;
            if (seenUrlSet.has(url)) continue;
            seenUrlSet.add(url);
            sourceList.push({ project, sourceUrl: url, title: entry.pr_title?.trim() ?? "" });
        }
    }

    const caseList: ManifestCase[] = [];
    const unavailableList: ManifestUnavailable[] = [];

    // Re importing is explicit and expensive. Reuse entries that were already
    // resolved so a retry after an API failure does not redo finished work.
    const existingByUrlMap = new Map<string, ManifestCase>();
    try {
        const existing = await loadManifest();
        for (const entry of existing.caseList) {
            existingByUrlMap.set(entry.sourceUrl, entry);
        }
    } catch {
        // No manifest yet, resolve everything.
    }

    for (const [index, source] of sourceList.entries()) {
        const label = `[${index + 1}/${sourceList.length}] ${source.sourceUrl}`;
        const existingEntry = existingByUrlMap.get(source.sourceUrl);
        if (existingEntry) {
            caseList.push(existingEntry);
            console.log(`${label} -> ${existingEntry.caseId} (reused)`);
            continue;
        }
        const parsed = parsePrUrl(source.sourceUrl);
        if (!parsed) {
            unavailableList.push({ sourceUrl: source.sourceUrl, reason: "unrecognized pull request url" });
            console.log(`${label} -> unavailable (bad url)`);
            continue;
        }
        const repoUrl = `https://github.com/${parsed.owner}/${parsed.repo}.git`;
        const caseId = `${source.project}__${parsed.prNumber}`;
        try {
            const pr = await fetchGithubPr(parsed.owner, parsed.repo, parsed.prNumber, token);
            if (!pr.head?.sha || !isSha(pr.head.sha)) {
                throw new Error("head commit is not available");
            }
            if (!pr.base?.sha || !isSha(pr.base.sha)) {
                throw new Error("base commit is not available");
            }
            const repoDir = await ensureCacheRepo(repoUrl);
            const startSha = await ensureCommitWithMergeBase(repoDir, repoUrl, pr.base.sha, pr.head.sha);
            const stat = await computeDiffStat(repoDir, startSha, pr.head.sha);
            caseList.push({
                caseId,
                project: source.project,
                sourceUrl: source.sourceUrl,
                repoUrl,
                prNumber: parsed.prNumber,
                title: pr.title ?? source.title,
                body: pr.body ?? "",
                baseSha: pr.base.sha,
                startSha,
                headSha: pr.head.sha,
                ...stat,
            });
            console.log(
                `${label} -> ${caseId} +${stat.addedLineCount} -${stat.deletedLineCount} (${stat.changedFileCount} files)`,
            );
        } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            unavailableList.push({ sourceUrl: source.sourceUrl, reason });
            console.log(`${label} -> unavailable (${reason})`);
        }
    }

    const manifest: Manifest = {
        schemaVersion: MANIFEST_SCHEMA_VERSION,
        datasetCommit,
        importedAt: new Date().toISOString(),
        caseList,
        unavailableList,
    };
    validateManifest(manifest);
    await mkdir(resolve(MANIFEST_PATH, ".."), { recursive: true });
    await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(
        `manifest written: ${caseList.length} cases, ${unavailableList.length} unavailable, dataset ${datasetCommit.slice(0, 12)}`,
    );
    return manifest;
}
