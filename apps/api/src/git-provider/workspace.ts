import { mkdir, readdir, readFile, rm } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import type { GitChangedFile, GitDiff, GitProvider, GitTree } from "./types.js";
import { debug, log, logError } from "../util/log.js";

export type WorkspaceGrepMatch = {
    path: string;
    line: number;
    text: string;
};

export type WorkspaceLoadOpts = {
    headRef: string;
    /** When set, fetch and cache PR diffs for changedFiles / getFileDiff. */
    prIid?: number;
};

export function getWorkspaceRoot(): string {
    return resolve(process.env.NODE_ENV === "production" ? "/data/workspaces" : "./data/workspaces");
}

/** Remove all workspace checkouts. Call once on process start. */
export async function clearWorkspaceRoot(): Promise<void> {
    const root = getWorkspaceRoot();
    await rm(root, { recursive: true, force: true });
    await mkdir(root, { recursive: true });
}

async function runCommand(args: string[], options: { cwd?: string } = {}): Promise<{ stdout: string; stderr: string }> {
    const proc = Bun.spawn(args, {
        cwd: options.cwd,
        stdout: "pipe",
        stderr: "pipe",
    });
    const [stdout, stderr, code] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
    ]);
    if (code !== 0) {
        throw new Error(`Command failed (${args.join(" ")}): ${stderr || stdout}`);
    }
    return { stdout, stderr };
}

export class Workspace {
    private rootDir: string | null = null;
    private headRef: string | null = null;
    private diffs: GitDiff[] | null = null;
    private loaded = false;

    constructor(private readonly provider: GitProvider) {}

    get root(): string {
        if (!this.rootDir) {
            throw new Error("Workspace is not loaded. Call load() first.");
        }
        return this.rootDir;
    }

    async load(opts: WorkspaceLoadOpts): Promise<void> {
        if (this.loaded) {
            debug(`already loaded at ${this.rootDir}`, "workspace");
            return;
        }

        const id = crypto.randomUUID();
        const rootDir = join(getWorkspaceRoot(), id);
        const archivePath = join(getWorkspaceRoot(), `${id}.tar.gz`);

        log(`loading archive → ${rootDir}`, "workspace");
        debug(`headRef=${opts.headRef}${opts.prIid != null ? ` prIid=${opts.prIid}` : ""}`, "workspace");

        await mkdir(rootDir, { recursive: true });

        try {
            debug("downloadArchive", "workspace");
            await this.provider.downloadArchive(opts.headRef, archivePath);

            debug("tar extract", "workspace");
            await runCommand(["tar", "-xzf", archivePath, "-C", rootDir, "--strip-components=1"]);
            await rm(archivePath, { force: true });

            this.rootDir = resolve(rootDir);
            this.headRef = opts.headRef;

            if (opts.prIid != null) {
                debug(`fetchPullRequestDiffList pr=${opts.prIid}`, "workspace");
                this.diffs = await this.provider.fetchPullRequestDiffList(opts.prIid);
                log(`cached ${this.diffs.length} file diffs`, "workspace");
            } else {
                this.diffs = null;
            }

            this.loaded = true;
            log(`ready (head=${opts.headRef.slice(0, 12)}…)`, "workspace");
        } catch (error) {
            logError("load failed, removing checkout", error, "workspace");
            await rm(rootDir, { recursive: true, force: true });
            await rm(archivePath, { force: true });
            throw error;
        }
    }

    /**
     * Demo/test helper: materialize files (and optional diffs) without remote archive.
     */
    async loadMock(opts: { files: Record<string, string>; diffs?: GitDiff[] }): Promise<void> {
        if (this.loaded) {
            return;
        }
        const id = crypto.randomUUID();
        const rootDir = join(getWorkspaceRoot(), id);
        await mkdir(rootDir, { recursive: true });

        try {
            for (const [filePath, content] of Object.entries(opts.files)) {
                const abs = this.safePath(filePath);
                await mkdir(dirname(abs), { recursive: true });
                await Bun.write(abs, content);
            }
            this.rootDir = resolve(rootDir);
            this.headRef = "mock-head";
            this.diffs = opts.diffs ?? null;
            this.loaded = true;
        } catch (error) {
            await rm(rootDir, { recursive: true, force: true });
            throw error;
        }
    }

    /** Remove this checkout from disk. Safe to call if never loaded. */
    async clean(): Promise<void> {
        const dir = this.rootDir;
        this.rootDir = null;
        this.headRef = null;
        this.diffs = null;
        this.loaded = false;
        if (dir) {
            await rm(dir, { recursive: true, force: true });
        }
    }

    private safePath(rel: string): string {
        const root = this.root;
        const normalized = rel.replace(/^\/+/, "").replace(/\/+$/, "");
        if (normalized === "" || normalized === ".") {
            return root;
        }
        const abs = resolve(root, normalized);
        if (abs !== root && !abs.startsWith(root + sep)) {
            throw new Error(`Path escapes workspace: ${rel}`);
        }
        return abs;
    }

    async list(relPath = ""): Promise<GitTree[]> {
        const dir = this.safePath(relPath);
        const entries = await readdir(dir, { withFileTypes: true });
        const prefix = relPath.replace(/^\/+|\/+$/g, "");
        return entries
            .filter((entry) => entry.name !== ".git")
            .map((entry) => ({
                name: entry.name,
                path: prefix ? `${prefix}/${entry.name}` : entry.name,
                type: entry.isDirectory() ? ("directory" as const) : ("file" as const),
            }));
    }

    async read(relPath: string): Promise<string> {
        const abs = this.safePath(relPath);
        try {
            return await readFile(abs, "utf-8");
        } catch {
            throw new Error(`File not found: ${relPath}`);
        }
    }

    async glob(pattern: string): Promise<string[]> {
        const paths: string[] = [];
        const glob = new Bun.Glob(pattern);
        for await (const path of glob.scan({ cwd: this.root, onlyFiles: true, dot: false })) {
            if (path === ".git" || path.startsWith(`.git${sep}`) || path.startsWith(".git/")) {
                continue;
            }
            paths.push(path);
            if (paths.length >= 100) {
                break;
            }
        }
        return paths;
    }

    async grep(query: string, opts?: { glob?: string; maxMatches?: number }): Promise<WorkspaceGrepMatch[]> {
        const maxMatches = opts?.maxMatches ?? 50;
        const args = ["rg", "-n", "--json", "-m", "20", "--max-count", "20", "--hidden", "--glob", "!.git/**"];
        if (opts?.glob) {
            args.push("--glob", opts.glob);
        }
        args.push("--", query);

        const proc = Bun.spawn(args, {
            cwd: this.root,
            stdout: "pipe",
            stderr: "pipe",
        });
        const [stdout, stderr, code] = await Promise.all([
            new Response(proc.stdout).text(),
            new Response(proc.stderr).text(),
            proc.exited,
        ]);
        // rg exits 1 when no matches
        if (code !== 0 && code !== 1) {
            throw new Error(`rg failed with exit code ${code}: ${stderr || stdout}`);
        }

        const matches: WorkspaceGrepMatch[] = [];
        for (const line of stdout.split("\n")) {
            if (!line) continue;
            try {
                const event = JSON.parse(line) as {
                    type?: string;
                    data?: {
                        path?: { text?: string };
                        line_number?: number;
                        lines?: { text?: string };
                    };
                };
                if (event.type !== "match" || !event.data?.path?.text) continue;
                matches.push({
                    path: event.data.path.text,
                    line: event.data.line_number ?? 0,
                    text: (event.data.lines?.text ?? "").replace(/\n$/, ""),
                });
                if (matches.length >= maxMatches) break;
            } catch {
                // ignore malformed lines
            }
        }
        return matches;
    }

    async changedFiles(): Promise<GitChangedFile[]> {
        if (!this.diffs) {
            throw new Error("Workspace PR diffs are not loaded. Call load() with prIid first.");
        }
        return this.diffs.map(({ oldPath, newPath, newFile, renamedFile, deletedFile }) => ({
            oldPath,
            newPath,
            newFile,
            renamedFile,
            deletedFile,
        }));
    }

    async getFileDiff(filePath: string): Promise<GitDiff> {
        if (!this.diffs) {
            throw new Error("Workspace PR diffs are not loaded. Call load() with prIid first.");
        }
        const diff = this.diffs.find((item) => item.newPath === filePath || item.oldPath === filePath);
        if (!diff) {
            throw new Error(`Changed file not found in pull request: ${filePath}`);
        }
        return diff;
    }
}
