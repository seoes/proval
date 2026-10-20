import { mkdir, readdir, readFile, rm } from "node:fs/promises";
import { join, posix, resolve, sep } from "node:path";
import { log, logAgent, logAgentError, logError } from "../util/log.js";
import type { GitChangedFile, GitDiff, GitProvider, GitTree } from "./types.js";

export type WorkspaceGrepMatch = {
    path: string;
    line: number;
    text: string;
};

export type WorkspaceVersion = {
    headSha: string;
    startSha?: string | null;
    baseSha?: string | null;
    previousSha?: string | null;
};

export type WorkspaceAgentInstruction = {
    path: string;
    directory: string;
    body: string;
    state: "loaded" | "truncated" | "empty" | "omitted" | "unavailable";
};

export type WorkspaceDiffAgainst = "start" | "base";

const SHA_PATTERN = /^[0-9a-f]{40}$/i;
const AGENT_INSTRUCTION_FILE_COUNT_LIMIT = 32;

export function getWorkspaceRoot(): string {
    return resolve(process.env.NODE_ENV === "production" ? "/data/workspaces" : "./data/workspaces");
}

/** Remove all workspace checkouts. Call once on process start. */
export async function clearWorkspaceRoot(): Promise<void> {
    const root = getWorkspaceRoot();
    await rm(root, { recursive: true, force: true });
    await mkdir(root, { recursive: true });
}

async function runCommand(
    args: string[],
    options: { cwd?: string; env?: Record<string, string> } = {},
): Promise<{ stdout: string; stderr: string }> {
    const proc = Bun.spawn(args, {
        cwd: options.cwd,
        env: options.env,
        stdout: "pipe",
        stderr: "pipe",
    });
    const [stdout, stderr, code] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
    ]);
    if (code !== 0) {
        const command = args
            .map((arg) => (arg.startsWith("http.extraHeader=") ? "http.extraHeader=<redacted>" : arg))
            .join(" ");
        throw new Error(`Command failed (${command}): ${stderr || stdout}`);
    }
    return { stdout, stderr };
}

export class Workspace {
    private rootDir: string | null = null;
    private createdDir = false;
    private authHeader: string | null = null;
    private isLoaded = false;
    private headSha: string | null = null;
    private startSha: string | null = null;
    private baseSha: string | null = null;
    private previousSha: string | null = null;
    private targetHeadSha: string | null = null;

    constructor(private readonly provider: GitProvider) {}

    public async init(): Promise<void> {
        if (this.rootDir || this.isLoaded) {
            throw new Error("Workspace is already initialized");
        }
        log("info", "Initializing workspace");

        const id = crypto.randomUUID();
        const rootDir = join(getWorkspaceRoot(), id);
        await mkdir(rootDir, { recursive: true });

        try {
            await runCommand(["git", "init", rootDir]);
            const url = await this.provider.fetchGitRepositoryUrl();
            const authHeader = await this.provider.fetchGitRepositoryAuthHeader();
            await runCommand(["git", "remote", "add", "origin", url], { cwd: rootDir });
            this.rootDir = resolve(rootDir);
            this.authHeader = authHeader;
            this.createdDir = true;
        } catch (error) {
            await rm(rootDir, { recursive: true, force: true });
            throw error;
        }
    }

    public async adopt(dir: string): Promise<void> {
        if (this.rootDir || this.isLoaded) {
            throw new Error("Workspace is already initialized");
        }
        this.rootDir = resolve(dir);
        this.createdDir = false;
        this.authHeader = null;
    }

    public async fetch(ref: string, options: { depth?: number } = {}): Promise<string> {
        if (!this.rootDir || !this.authHeader) {
            throw new Error("Workspace is not initialized. Call init() first.");
        }

        const want = ref.trim();
        if (!want) {
            throw new Error("ref is required");
        }

        const depth = options.depth ?? 1;
        const target = want.replace(/^refs\/heads\//, "refs/remotes/origin/");
        const spec = SHA_PATTERN.test(want) ? want : `${want}:${target}`;
        await runCommand(
            ["git", "-c", `http.extraHeader=${this.authHeader}`, "fetch", `--depth=${depth}`, "origin", spec],
            {
                cwd: this.rootDir!,
                env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
            },
        );

        // Returns the fetched remote ref name (refs/remotes/origin/...)
        return target;
    }

    public async checkout(sha: string): Promise<void> {
        if (!this.rootDir) {
            throw new Error("Workspace is not initialized. Call init() or adopt() first.");
        }
        const target = sha.trim();
        if (!target) {
            throw new Error("checkout target is required");
        }
        await runCommand(["git", "checkout", "--detach", target], { cwd: this.rootDir! });
        const { stdout } = await runCommand(["git", "rev-parse", "HEAD"], { cwd: this.rootDir! });
        this.headSha = stdout.trim();
        this.isLoaded = true;
    }

    public async loadFromPullRequest(input: {
        prIid: number;
        targetBranch: string;
        headSha: string;
        startSha: string;
        baseSha: string;
        previousSha?: string | null;
    }): Promise<void> {
        if (!this.rootDir) {
            await this.init();
        }

        let targetHeadSha = input.baseSha;
        if (this.authHeader) {
            await this.fetch(this.provider.getPullRequestHeadFetchRef(input.prIid));
            const targetRef = await this.fetch(this.provider.getBranchFetchRef(input.targetBranch));
            const { stdout } = await runCommand(["git", "rev-parse", `${targetRef}^{commit}`], {
                cwd: this.rootDir!,
            });
            targetHeadSha = stdout.trim();
            if (input.startSha) {
                try {
                    await this.fetch(input.startSha);
                } catch (error) {
                    logError(`Failed to fetch startSha ${input.startSha}`, error);
                    throw error;
                }
            }
            if (input.previousSha) {
                try {
                    await this.fetch(input.previousSha);
                } catch (error) {
                    logError(`Failed to fetch previousSha ${input.previousSha}`, error);
                }
            }
        }
        this.setVersion({
            headSha: input.headSha,
            startSha: input.startSha,
            baseSha: input.baseSha,
            previousSha: input.previousSha ?? null,
        });
        this.targetHeadSha = targetHeadSha;
        await this.checkout(input.headSha);
    }

    public async loadFromBranch(branch: string): Promise<void> {
        if (!this.rootDir) {
            await this.init();
        }
        const branchRef = this.provider.getBranchFetchRef(branch);
        const target = this.authHeader ? await this.fetch(branchRef) : branchRef;
        await this.checkout(target);
        this.targetHeadSha = this.headSha;
    }

    public setVersion(version: WorkspaceVersion): void {
        this.headSha = version.headSha.trim();
        this.startSha = version.startSha?.trim() || null;
        this.baseSha = version.baseSha?.trim() || null;
        this.targetHeadSha = this.baseSha;
        this.previousSha = version.previousSha?.trim() || null;
    }

    public async clean(): Promise<void> {
        const dir = this.rootDir;
        const shouldRemove = this.createdDir;
        this.rootDir = null;
        this.createdDir = false;
        this.authHeader = null;
        this.isLoaded = false;
        this.headSha = null;
        this.startSha = null;
        this.baseSha = null;
        this.previousSha = null;
        this.targetHeadSha = null;
        if (dir && shouldRemove) {
            await rm(dir, { recursive: true, force: true });
        }
    }

    private isWorkspaceLoaded(): void {
        if (!this.isLoaded || !this.rootDir) {
            throw new Error("Workspace is not loaded.");
        }
    }

    private safePath(rel: string): string {
        this.isWorkspaceLoaded();
        const root = this.rootDir!;
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

    private async loadChangedFileList(fromSha: string, toSha: string): Promise<GitChangedFile[]> {
        const { stdout } = await runCommand(["git", "diff", "--name-status", "-M", fromSha, toSha], {
            cwd: this.rootDir!,
        });
        const list: GitChangedFile[] = [];
        for (const line of stdout.split("\n").filter(Boolean)) {
            const tab = line.split("\t");
            const code = tab[0] ?? "";
            if (code === "C" || code.startsWith("C")) {
                continue;
            }

            const isRename = code.startsWith("R");
            const isDelete = code === "D";
            const isAdd = code === "A";
            const firstPath = tab[1];
            const secondPath = tab[2];
            if (!firstPath) {
                continue;
            }
            if (isRename && !secondPath) {
                continue;
            }

            const newPath = isRename ? secondPath : firstPath;
            list.push({
                oldPath: isRename ? firstPath : isAdd ? newPath : firstPath,
                newPath,
                newFile: isAdd,
                renamedFile: isRename,
                deletedFile: isDelete,
            });
        }
        return list;
    }

    private async loadFileDiff(
        fromSha: string,
        toSha: string,
        filePath: string,
        fileList: GitChangedFile[],
        notFoundPrefix: string,
    ): Promise<GitDiff> {
        const file = fileList.find((item) => item.newPath === filePath || item.oldPath === filePath);
        if (!file) {
            throw new Error(`${notFoundPrefix}${filePath}`);
        }
        const pathList =
            file.renamedFile && file.oldPath !== file.newPath
                ? [file.oldPath, file.newPath]
                : [file.deletedFile ? file.oldPath : file.newPath];
        const { stdout } = await runCommand(["git", "diff", "-M", fromSha, toSha, "--", ...pathList], {
            cwd: this.rootDir!,
        });
        return { ...file, diff: stdout };
    }

    public async list(relPath = ""): Promise<GitTree[]> {
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

    public async read(relPath: string): Promise<string> {
        const abs = this.safePath(relPath);
        try {
            return await readFile(abs, "utf-8");
        } catch {
            throw new Error(`File not found: ${relPath}`);
        }
    }

    public async loadAgentInstructionList(
        changedFileList: GitChangedFile[],
        activityId: number,
        label: string,
    ): Promise<{ fileList: WorkspaceAgentInstruction[]; hasOverflow: boolean }> {
        this.isWorkspaceLoaded();
        if (!this.targetHeadSha) throw new Error("Workspace target head is not loaded.");

        const directorySet = new Set([""]);
        for (const file of changedFileList) {
            for (const path of [file.oldPath, file.newPath]) {
                if (!path) continue;
                let directory = posix.dirname(path);
                while (directory !== "." && directory !== "/") {
                    directorySet.add(directory);
                    directory = posix.dirname(directory);
                }
            }
        }

        const directoryList = [...directorySet].sort((a, b) => {
            const depth = (path: string) => (path ? path.split("/").length : 0);
            return depth(a) - depth(b) || (a < b ? -1 : a > b ? 1 : 0);
        });
        const fileList: WorkspaceAgentInstruction[] = [];
        let hasOverflow = false;
        const entryMap = new Map<string, { path: string; mode: string; oid: string }>();
        try {
            const { stdout } = await runCommand(["git", "ls-tree", "-r", "-t", "-z", this.targetHeadSha], {
                cwd: this.rootDir!,
            });
            for (const record of stdout.split("\0")) {
                const tabIndex = record.indexOf("\t");
                if (tabIndex < 0) continue;
                const path = record.slice(tabIndex + 1);
                const name = posix.basename(path);
                if (name !== "AGENTS.md" && name !== "agents.md") continue;
                const directory = posix.dirname(path) === "." ? "" : posix.dirname(path);
                if (!directorySet.has(directory)) continue;
                const [mode, , oid] = record.slice(0, tabIndex).split(" ");
                if (!mode || !oid) continue;
                if (name === "AGENTS.md" || !entryMap.has(directory)) {
                    entryMap.set(directory, { path, mode, oid });
                }
            }
        } catch {
            logAgentError(activityId, "Could not search guidance at the target head", undefined, label);
            return { fileList, hasOverflow };
        }

        for (const directory of directoryList) {
            const entry = entryMap.get(directory);
            if (!entry) continue;
            const { path, mode, oid } = entry;
            if (fileList.length >= AGENT_INSTRUCTION_FILE_COUNT_LIMIT) {
                hasOverflow = true;
                logAgent(
                    activityId,
                    `Guidance ${JSON.stringify(path)} was omitted from the initial context due to the file count limit`,
                    label,
                );
                continue;
            }
            const file: WorkspaceAgentInstruction = { path, directory, body: "", state: "unavailable" };
            fileList.push(file);

            try {
                if (mode !== "100644" && mode !== "100755") throw new Error("Not a regular Git file");
                const proc = Bun.spawn(["git", "cat-file", "blob", oid], {
                    cwd: this.rootDir!,
                    stdout: "pipe",
                    stderr: "ignore",
                });
                const reader = proc.stdout.getReader();
                const decoder = new TextDecoder("utf-8", { ignoreBOM: true });
                let content = "";
                try {
                    while (true) {
                        const { value, done } = await reader.read();
                        if (done) {
                            content += decoder.decode();
                            break;
                        }
                        content += decoder.decode(value, { stream: true });
                    }
                } finally {
                    await reader.cancel();
                    await proc.exited;
                }
                if (proc.exitCode !== 0) throw new Error("Could not read Git blob");
                if (!content.trim()) {
                    file.body = "";
                    file.state = "empty";
                } else {
                    file.body = content;
                    file.state = "loaded";
                }
            } catch {
                file.state = "unavailable";
                logAgentError(activityId, `Could not read guidance ${JSON.stringify(path)}`, undefined, label);
            }
        }
        return { fileList, hasOverflow };
    }

    public async glob(pattern: string): Promise<string[]> {
        this.isWorkspaceLoaded();
        const paths: string[] = [];
        const glob = new Bun.Glob(pattern);
        for await (const path of glob.scan({ cwd: this.rootDir!, onlyFiles: true, dot: false })) {
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

    public async grep(query: string, opts?: { glob?: string; maxMatches?: number }): Promise<WorkspaceGrepMatch[]> {
        this.isWorkspaceLoaded();
        const maxMatches = opts?.maxMatches ?? 50;
        const args = ["rg", "-n", "--json", "-m", "20", "--max-count", "20", "--hidden", "--glob", "!.git/**"];
        if (opts?.glob) {
            args.push("--glob", opts.glob);
        }
        args.push("--", query);

        const proc = Bun.spawn(args, {
            cwd: this.rootDir!,
            stdout: "pipe",
            stderr: "pipe",
        });
        const [stdout, stderr, code] = await Promise.all([
            new Response(proc.stdout).text(),
            new Response(proc.stderr).text(),
            proc.exited,
        ]);
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

    private resolveDiffSha(against: WorkspaceDiffAgainst): { fromSha: string; headSha: string } {
        const fromSha = against === "start" ? this.startSha : this.baseSha;
        const headSha = this.headSha;
        if (!fromSha) {
            throw new Error(
                against === "start" ? "Workspace startSha is not loaded." : "Workspace baseSha is not loaded.",
            );
        }
        if (!headSha) {
            throw new Error("Workspace headSha is not loaded.");
        }
        return { fromSha, headSha };
    }

    public isPullRequest(): boolean {
        return this.startSha !== null;
    }

    public async changedFiles(against: WorkspaceDiffAgainst = "start"): Promise<GitChangedFile[]> {
        this.isWorkspaceLoaded();
        const { fromSha, headSha } = this.resolveDiffSha(against);
        return this.loadChangedFileList(fromSha, headSha);
    }

    public async getFileDiff(filePath: string, against: WorkspaceDiffAgainst = "start"): Promise<GitDiff> {
        this.isWorkspaceLoaded();
        const { fromSha, headSha } = this.resolveDiffSha(against);
        const fileList = await this.changedFiles(against);
        return this.loadFileDiff(
            fromSha,
            headSha,
            filePath,
            fileList,
            against === "start"
                ? "Changed file not found in pull request: "
                : "Changed file not found in base compare: ",
        );
    }

    public async pushChangedFileList(): Promise<GitChangedFile[]> {
        this.isWorkspaceLoaded();
        if (!this.previousSha) {
            throw new Error("Workspace push diffs are not loaded. Call setVersion() with previousSha first.");
        }
        return this.loadChangedFileList(this.previousSha, this.headSha!);
    }

    public async getPushFileDiff(filePath: string): Promise<GitDiff> {
        this.isWorkspaceLoaded();
        const fileList = await this.pushChangedFileList();
        return this.loadFileDiff(
            this.previousSha!,
            this.headSha!,
            filePath,
            fileList,
            "Changed file not found in push compare: ",
        );
    }
}
