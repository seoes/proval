import { resolve } from "node:path";
import { readFile, rm, mkdir } from "node:fs/promises";
import type { GitDiff, GitPullRequestVersion } from "../src/git-provider/types.js";
import { Workspace } from "../src/git-provider/workspace.js";
import { MockProvider, type TestInput } from "../mock/provider.js";
import { createSender } from "../src/agent/llm/factory.js";
import { runPullRequestReview } from "../src/agent/pull-request/index.js";

// Load env
const envPath = resolve(import.meta.dir, "../.env.test");
const env = await readEnvFile(envPath);

const REPO_URL = requireEnv(env, "REPO_URL");
const REPO_TOKEN = env.REPO_TOKEN ?? "";
const BASE_BRANCH = requireEnv(env, "BASE_BRANCH");
const HEAD_BRANCH = requireEnv(env, "HEAD_BRANCH");
const PR_TITLE = env.PR_TITLE ?? "test MR";
const PR_BODY = env.PR_BODY ?? "";
const LLM_BASE_URL = requireEnv(env, "LLM_BASE_URL");
const LLM_API_KEY = requireEnv(env, "LLM_API_KEY");
const LLM_MODEL = requireEnv(env, "LLM_MODEL");
const LANGUAGE = env.LANGUAGE ?? "English";

const CLONE_DIR = resolve(import.meta.dir, "../data/workspaces/test-review-repo");

// ─── Helpers ───────────────────────────────────────────────────────

async function readEnvFile(path: string): Promise<Record<string, string>> {
    const content = await readFile(path, "utf-8");
    const result: Record<string, string> = {};
    for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eqIndex = trimmed.indexOf("=");
        if (eqIndex === -1) continue;
        result[trimmed.slice(0, eqIndex).trim()] = trimmed.slice(eqIndex + 1).trim();
    }
    return result;
}

function requireEnv(env: Record<string, string>, key: string): string {
    const v = env[key];
    if (!v) throw new Error(`Missing required env: ${key}`);
    return v;
}

async function git(args: string[], cwd?: string): Promise<string> {
    const proc = Bun.spawn(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe" });
    const [stdout, stderr, code] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
    ]);
    if (code !== 0) throw new Error(`git ${args[0]} failed (${code}): ${stderr || stdout}`);
    return stdout.trim();
}

// ─── Step 1: Clone ─────────────────────────────────────────────────

console.log("🔄 Step 1: Clone repo");
await rm(CLONE_DIR, { recursive: true, force: true });
await mkdir(CLONE_DIR, { recursive: true });

const authUrl = REPO_TOKEN
    ? REPO_URL.replace("://", `://oauth2:${REPO_TOKEN}@`)
    : REPO_URL;

await git(["clone", "--no-checkout", "--single-branch", "-b", BASE_BRANCH, authUrl, "."], CLONE_DIR);
await git(["fetch", "origin", HEAD_BRANCH], CLONE_DIR);
console.log("  ✅ cloned");

// ─── Step 2: SHAs ──────────────────────────────────────────────────

console.log("🔄 Step 2: Resolve SHAs");
const baseSha = await git(["rev-parse", `origin/${BASE_BRANCH}`], CLONE_DIR);
const headSha = await git(["rev-parse", `origin/${HEAD_BRANCH}`], CLONE_DIR);
const mergeBase = await git(["merge-base", baseSha, headSha], CLONE_DIR);

const version: GitPullRequestVersion = {
    headSha,
    baseSha: mergeBase,
    startSha: mergeBase,
};
console.log(`  base=${mergeBase.slice(0, 12)} head=${headSha.slice(0, 12)}`);

// ─── Step 3: Read head tree ────────────────────────────────────────

console.log("🔄 Step 3: Read head tree");
const treeOutput = await git(["ls-tree", "-r", "--name-only", headSha], CLONE_DIR);
const allPaths = treeOutput.split("\n").filter(Boolean);

const SKIP_DIR = ["node_modules", ".git", "dist", "build", ".svelte-kit", ".turbo"];
const SKIP_EXT = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".woff", ".woff2", ".ttf", ".eot", ".pdf", ".zip", ".tar", ".gz", ".db", ".sqlite"];

const files: Record<string, string> = {};
let skipped = 0;
for (const p of allPaths) {
    if (SKIP_DIR.some((d) => p.startsWith(d + "/") || p.includes("/" + d + "/"))) { skipped++; continue; }
    const ext = p.includes(".") ? "." + p.split(".").pop()!.toLowerCase() : "";
    if (SKIP_EXT.includes(ext)) { skipped++; continue; }
    try { files[p] = await git(["show", `${headSha}:${p}`], CLONE_DIR); } catch { skipped++; }
}
console.log(`  ✅ ${Object.keys(files).length} files (${skipped} skipped)`);

// ─── Step 4: Generate diffs ────────────────────────────────────────

console.log("🔄 Step 4: Generate diffs");
const nsOutput = await git(["diff", "--name-status", "-M", mergeBase, headSha], CLONE_DIR);
const diffList: GitDiff[] = [];

for (const line of nsOutput.split("\n").filter(Boolean)) {
    const tab = line.split("\t");
    const code = tab[0]!;
    if (code === "C") continue; // skip copies

    const isRename = code.startsWith("R");
    const isDelete = code === "D";
    const isAdd = code === "A";

    const oldPath = isRename ? tab[1]! : isDelete ? tab[1]! : (isAdd ? "" : tab[1]!);
    const newPath = isRename ? tab[2]! : tab[1]!;

    let diffText: string;
    try {
        diffText = await git(["diff", `${mergeBase}...${headSha}`, "--", isRename ? newPath : (isDelete ? oldPath : newPath)], CLONE_DIR);
    } catch {
        diffText = "";
    }

    // Binary files produce empty diff from text git diff, skip them
    if (!diffText && !isDelete) continue;

    diffList.push({
        oldPath: isRename ? oldPath : (isAdd ? newPath : oldPath),
        newPath,
        newFile: isAdd,
        renamedFile: isRename,
        deletedFile: isDelete,
        diff: diffText,
    });
}
console.log(`  ✅ ${diffList.length} diffs`);

// ─── Step 5: Run review pipeline ───────────────────────────────────

console.log("🔄 Step 5: Run review pipeline\n");

const input: TestInput = {
    detail: {
        title: PR_TITLE,
        description: PR_BODY || null,
        sourceBranch: HEAD_BRANCH,
        targetBranch: BASE_BRANCH,
        author: "test-user",
        state: "opened",
    },
    diffs: diffList,
    files,
    version,
};

const provider = new MockProvider(input);
const workspace = new Workspace(provider);
await workspace.loadMock({ files, diffs: diffList });

const sender = createSender({
    provider: "openai",
    apiKey: LLM_API_KEY,
    baseURL: LLM_BASE_URL,
    model: LLM_MODEL,
});

const usage = await runPullRequestReview({
    provider,
    workspace,
    llmSender: sender,
    prIid: 1,
    isInlineReview: true,
    language: LANGUAGE,
    activityId: 0,
});

// ─── Summary ───────────────────────────────────────────────────────

console.log("\n" + "=".repeat(60));
console.log("✅ Review complete");
console.log("=".repeat(60));
console.log(`  Comments posted: ${provider.posted.length}`);
for (const [i, p] of provider.posted.entries()) {
    const isDebug = p.body.startsWith("## Debug");
    const preview = p.body.length > 120 ? p.body.slice(0, 120) + "…" : p.body.replace(/\n/g, " ");
    console.log(`  [${i + 1}${isDebug ? ":debug" : `:${p.type}`}] ${preview}`);
}
console.log(`  Tokens: input=${usage.inputToken} output=${usage.outputToken} cached=${usage.cachedInputToken}`);

await rm(CLONE_DIR, { recursive: true, force: true });
console.log("  🧹 Cleaned up");
