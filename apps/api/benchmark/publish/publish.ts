import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { buildRootReadme, renderBatchReadme } from "./readme.js";

const GIT_AUTHOR_NAME = "dowonseo";
const GIT_AUTHOR_EMAIL = "me@dowonseo.com";

function benchmarkDataDir(): string {
    return resolve(process.env.BENCHMARK_DATA_DIR ?? join(import.meta.dir, "..", "data"));
}

function resultRepoDir(): string {
    return join(benchmarkDataDir(), "result-repo");
}

function gitBin(): string {
    const path = Bun.which("git");
    if (!path) return "git";
    try {
        return realpathSync(path);
    } catch {
        return path;
    }
}

export function resolveResultRepoUrl(): string {
    const raw = process.env.RESULT_REPO_URL?.trim();
    if (!raw) throw new Error("Missing RESULT_REPO_URL (see .env.benchmark.example)");
    if (/\s/.test(raw)) throw new Error("Invalid RESULT_REPO_URL");
    let parsed: URL;
    try {
        parsed = new URL(raw);
    } catch {
        throw new Error("Invalid RESULT_REPO_URL");
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:" && parsed.protocol !== "file:") {
        throw new Error("Invalid RESULT_REPO_URL (use an https, http, or file URL)");
    }
    if (parsed.username || parsed.password) {
        throw new Error("Invalid RESULT_REPO_URL (do not embed credentials in the URL)");
    }
    return raw;
}

export function assertValidBatchId(batchId: string): void {
    if (!batchId || batchId.includes("/") || batchId.includes("..")) {
        throw new Error("Invalid batch id");
    }
}

export function sanitizeRunJson(content: string): string {
    const value = JSON.parse(content) as Record<string, unknown>;
    delete value.modelBaseUrl;
    delete value.machineDescription;
    return `${JSON.stringify(value, null, 2)}\n`;
}

export async function publishFileNameList(batchDir: string): Promise<string[]> {
    const nameList = ["run.json", "result.jsonl", "README.md"];
    if (existsSync(join(batchDir, "score.json"))) nameList.push("score.json");
    return nameList;
}

/** GitHub git HTTPS accepts Basic auth, not Bearer. A Bearer header gets 401 and a username prompt. */
export function gitAuthorizationHeader(token: string): string {
    const basic = Buffer.from(`x-access-token:${token}`, "utf8").toString("base64");
    return `AUTHORIZATION: basic ${basic}`;
}

function redactSecret(text: string, secret: string | undefined): string {
    if (!secret) return text;
    const encoded = Buffer.from(`x-access-token:${secret}`, "utf8").toString("base64");
    return text.split(secret).join("***").split(encoded).join("***");
}

async function git(
    argList: string[],
    cwd: string,
    token: string | undefined,
    orThrow = false,
): Promise<{ stdout: string; stderr: string; code: number }> {
    const prefix = token
        ? ["-c", "credential.helper=", "-c", `http.extraheader=${gitAuthorizationHeader(token)}`]
        : ["-c", "credential.helper="];
    const proc = Bun.spawn([gitBin(), ...prefix, ...argList], {
        cwd,
        stdout: "pipe",
        stderr: "pipe",
        stdin: "ignore",
        env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "Never" },
    });
    const [stdout, stderr, code] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
    ]);
    const result = { stdout: stdout.trim(), stderr: stderr.trim(), code };
    if (orThrow && code !== 0) {
        const detail = redactSecret(result.stderr || result.stdout, token);
        throw new Error(`git ${argList[0]} failed (${code}): ${detail}`);
    }
    return result;
}

async function preparePublishedBatch(batchId: string, targetDir: string): Promise<void> {
    const sourceDir = join(benchmarkDataDir(), "output", batchId);
    const runPath = join(sourceDir, "run.json");
    const resultPath = join(sourceDir, "result.jsonl");
    if (!existsSync(runPath) || !existsSync(resultPath)) {
        throw new Error(`Missing batch output for ${batchId} (need run.json and result.jsonl)`);
    }
    const runJson = await readFile(runPath, "utf-8");
    const resultJsonl = await readFile(resultPath, "utf-8");
    const scorePath = join(sourceDir, "score.json");
    const scoreJson = existsSync(scorePath) ? await readFile(scorePath, "utf-8") : undefined;
    await mkdir(targetDir, { recursive: true });
    await writeFile(join(targetDir, "run.json"), sanitizeRunJson(runJson));
    await copyFile(resultPath, join(targetDir, "result.jsonl"));
    await writeFile(
        join(targetDir, "README.md"),
        renderBatchReadme({ batchId, runJson, resultJsonl, scoreJson }),
    );
    if (scoreJson !== undefined) await writeFile(join(targetDir, "score.json"), scoreJson);
}

async function ensureResultRepo(repoUrl: string, token: string | undefined): Promise<void> {
    const repoDir = resultRepoDir();
    await rm(repoDir, { recursive: true, force: true });
    await git(
        ["clone", "--depth", "1", "--branch", "main", repoUrl, repoDir],
        benchmarkDataDir(),
        token,
        true,
    );
}

async function commitAndPush(
    batchId: string,
    repoUrl: string,
    token: string | undefined,
    replaced: boolean,
): Promise<boolean> {
    const repoDir = resultRepoDir();
    await git(["config", "user.name", GIT_AUTHOR_NAME], repoDir, token, true);
    await git(["config", "user.email", GIT_AUTHOR_EMAIL], repoDir, token, true);
    await git(["add", "-A"], repoDir, token, true);
    if (!(await git(["status", "--porcelain"], repoDir, token, true)).stdout.trim()) return false;
    const message = replaced ? `Overwrite ${batchId}` : `Publish ${batchId}`;
    await git(["commit", "-m", message], repoDir, token, true);
    const remotes = await git(["remote"], repoDir, token);
    if (remotes.code === 0 && !remotes.stdout.split("\n").some((line) => line.trim() === "origin")) {
        await git(["remote", "add", "origin", repoUrl], repoDir, token, true);
    }
    const pull = await git(["pull", "--rebase", "origin", "main"], repoDir, token);
    if (pull.code !== 0 && !pull.stderr.includes("couldn't find remote ref")) {
        throw new Error(`git pull failed (${pull.code}): ${redactSecret(pull.stderr || pull.stdout, token)}`);
    }
    await git(["push", "origin", "HEAD:main"], repoDir, token, true);
    return true;
}

export async function publishBatch(batchId: string): Promise<void> {
    assertValidBatchId(batchId);
    const repoUrl = resolveResultRepoUrl();
    const tokenRaw = process.env.RESULT_REPO_TOKEN?.trim();
    const needsToken = repoUrl.startsWith("https://") || repoUrl.startsWith("http://");
    if (needsToken && !tokenRaw) {
        throw new Error("Missing RESULT_REPO_TOKEN (see .env.benchmark.example)");
    }
    const token = tokenRaw || undefined;
    const repoDir = resultRepoDir();
    try {
        await ensureResultRepo(repoUrl, token);
        const batchTargetDir = join(repoDir, "result", batchId);
        const replaced = existsSync(batchTargetDir);
        await rm(batchTargetDir, { recursive: true, force: true });
        await preparePublishedBatch(batchId, batchTargetDir);
        await writeFile(join(repoDir, "README.md"), await buildRootReadme(repoDir));
        if (!(await commitAndPush(batchId, repoUrl, token, replaced))) {
            console.log("No changes to publish");
        }
    } finally {
        await rm(repoDir, { recursive: true, force: true });
    }
}
