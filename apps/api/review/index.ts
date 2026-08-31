import { mkdir, readdir, readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { GitDiff, GitPullRequestVersion } from "../src/git-provider/types.js";
import { Workspace } from "../src/git-provider/workspace.js";
import { MockProvider, type MockInput, type PostedAction } from "../mock/provider.js";
import { createSender } from "../src/agent/llm/factory.js";
import { runPullRequestReview, type PullRequestReviewResult } from "../src/agent/pull-request/index.js";
import { loadConfig, type ReviewConfig } from "./config.js";
import { logBlock, logError, logInfo, logSection, logStep } from "./log.js";
import { writeReviewResult } from "./save-result.js";

const CLONE_DIR = resolve(import.meta.dir, "data/repo");

const SKIP_DIR_LIST = ["node_modules", ".git", "dist", "build", ".svelte-kit", ".turbo"];
const SKIP_EXT_LIST = [
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".webp",
    ".ico",
    ".woff",
    ".woff2",
    ".ttf",
    ".eot",
    ".pdf",
    ".zip",
    ".tar",
    ".gz",
    ".db",
    ".sqlite",
];

async function git(argList: string[], cwd?: string): Promise<string> {
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

function authRepoUrl(repoUrl: string, token: string): string {
    if (!token) {
        return repoUrl;
    }
    return repoUrl.replace("://", `://oauth2:${token}@`);
}

function maskSecret(value: string): string {
    if (value.length <= 8) {
        return "***";
    }
    return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

function shouldSkipPath(path: string): boolean {
    if (SKIP_DIR_LIST.some((dir) => path === dir || path.startsWith(`${dir}/`) || path.includes(`/${dir}/`))) {
        return true;
    }
    const dot = path.lastIndexOf(".");
    if (dot === -1) {
        return false;
    }
    const ext = path.slice(dot).toLowerCase();
    return SKIP_EXT_LIST.includes(ext);
}

function printConfig(config: ReviewConfig): void {
    logSection("Config");
    logInfo(`repoUrl       ${config.repoUrl}`);
    logInfo(`repoToken     ${config.repoToken ? maskSecret(config.repoToken) : "(none)"}`);
    logInfo(`baseBranch    ${config.baseBranch}`);
    logInfo(`headBranch    ${config.headBranch}`);
    logInfo(`prTitle       ${config.prTitle}`);
    logInfo(`prBody        ${config.prBody || "(empty)"}`);
    logInfo(`llmBaseUrl    ${config.llmBaseUrl}`);
    logInfo(`llmApiKey     ${maskSecret(config.llmApiKey)}`);
    logInfo(`llmModel      ${config.llmModel}`);
    logInfo(`language      ${config.language}`);
    logInfo(`inlineReview  ${config.inlineReview}`);
    logInfo(`saveResult    ${config.saveResult}`);
}

async function prepareClone(config: ReviewConfig): Promise<string> {
    logStep("clone", `start → ${CLONE_DIR}`);
    await rm(CLONE_DIR, { recursive: true, force: true });
    await mkdir(CLONE_DIR, { recursive: true });

    const url = authRepoUrl(config.repoUrl, config.repoToken);
    // single-branch clone only configures fetch for base. Head needs an explicit refspec
    // so refs/remotes/origin/<head> exists for checkout / rev-parse.
    logStep("clone", `clone ${config.baseBranch} (single-branch, no-checkout)`);
    await git(["clone", "--no-checkout", "--single-branch", "-b", config.baseBranch, url, "."], CLONE_DIR);

    logStep("clone", `fetch ${config.headBranch}`);
    await git(
        ["fetch", "origin", `+refs/heads/${config.headBranch}:refs/remotes/origin/${config.headBranch}`],
        CLONE_DIR,
    );

    logStep("clone", `checkout origin/${config.headBranch}`);
    await git(["checkout", "--force", `origin/${config.headBranch}`], CLONE_DIR);
    logStep("clone", "done");
    return CLONE_DIR;
}

async function resolveVersion(config: ReviewConfig, cloneDir: string): Promise<GitPullRequestVersion> {
    logStep("version", "resolve SHAs");
    const headSha = await git(["rev-parse", `origin/${config.headBranch}`], cloneDir);
    const baseSha = await git(["rev-parse", `origin/${config.baseBranch}`], cloneDir);
    const startSha = await git(["merge-base", baseSha, headSha], cloneDir);

    logInfo(`base   ${baseSha}`);
    logInfo(`start  ${startSha}`);
    logInfo(`head       ${headSha}`);

    return {
        headSha,
        baseSha,
        startSha,
    };
}

async function walkFiles(dir: string, prefix = ""): Promise<string[]> {
    const entries = await readdir(dir, { withFileTypes: true });
    const paths: string[] = [];
    for (const entry of entries) {
        const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (shouldSkipPath(rel)) {
            continue;
        }
        if (entry.isDirectory()) {
            paths.push(...(await walkFiles(join(dir, entry.name), rel)));
        } else if (entry.isFile()) {
            paths.push(rel);
        }
    }
    return paths;
}

async function readFileMap(cloneDir: string): Promise<Record<string, string>> {
    logStep("files", "read head tree");
    const pathList = await walkFiles(cloneDir);
    const files: Record<string, string> = {};
    let skipped = 0;

    for (const path of pathList) {
        try {
            files[path] = await readFile(join(cloneDir, path), "utf-8");
        } catch {
            skipped++;
        }
    }

    logInfo(`loaded ${Object.keys(files).length} files (skipped ${skipped})`);
    return files;
}

async function buildDiffList(mergeBase: string, headSha: string, cloneDir: string): Promise<GitDiff[]> {
    logStep("diffs", "build changed file diffs");
    const nsOutput = await git(["diff", "--name-status", "-M", mergeBase, headSha], cloneDir);
    const diffList: GitDiff[] = [];

    for (const line of nsOutput.split("\n").filter(Boolean)) {
        const tab = line.split("\t");
        const code = tab[0]!;
        if (code === "C" || code.startsWith("C")) {
            continue;
        }

        const isRename = code.startsWith("R");
        const isDelete = code === "D";
        const isAdd = code === "A";

        const oldPath = isRename ? tab[1]! : isDelete ? tab[1]! : isAdd ? "" : tab[1]!;
        const newPath = isRename ? tab[2]! : tab[1]!;
        const pathForDiff = isRename ? newPath : isDelete ? oldPath : newPath;

        let diffText = "";
        try {
            diffText = await git(["diff", `${mergeBase}...${headSha}`, "--", pathForDiff], cloneDir);
        } catch {
            diffText = "";
        }

        if (!diffText && !isDelete) {
            continue;
        }

        diffList.push({
            oldPath: isRename ? oldPath : isAdd ? newPath : oldPath,
            newPath,
            newFile: isAdd,
            renamedFile: isRename,
            deletedFile: isDelete,
            diff: diffText,
        });
    }

    logInfo(`diff count ${diffList.length}`);
    for (const diff of diffList) {
        const flag = diff.deletedFile ? "D" : diff.newFile ? "A" : diff.renamedFile ? "R" : "M";
        const label = diff.renamedFile ? `${diff.oldPath} → ${diff.newPath}` : diff.newPath;
        logInfo(`  ${flag} ${label}`);
    }
    return diffList;
}

function buildMockInput(
    config: ReviewConfig,
    version: GitPullRequestVersion,
    files: Record<string, string>,
    diffs: GitDiff[],
): MockInput {
    return {
        detail: {
            title: config.prTitle,
            description: config.prBody || null,
            sourceBranch: config.headBranch,
            targetBranch: config.baseBranch,
            author: "local-review",
            state: "opened",
        },
        diffs,
        files,
        version,
    };
}

function postedLabel(posted: PostedAction, index: number): string {
    const kind = posted.body.startsWith("## Debug") ? "debug" : posted.type;
    return `Posted #${index + 1} [${kind}]`;
}

function printResult(provider: MockProvider, review: PullRequestReviewResult): void {
    logSection("Plan review units");
    if (review.reviewUnitList.length === 0) {
        logInfo("(none)");
    } else {
        for (const unit of review.reviewUnitList) {
            logBlock(
                `Unit ${unit.id}: ${unit.name}`,
                [
                    unit.description,
                    "",
                    JSON.stringify({ files: unit.files, references: unit.references ?? [] }, null, 2),
                ].join("\n"),
            );
        }
    }

    logSection("Sub agent outputs (to writing)");
    if (review.subAgentList.length === 0) {
        logInfo("(none)");
    } else {
        for (const sub of review.subAgentList) {
            logBlock(
                `Sub ${sub.index}/${sub.total}: ${sub.reviewUnit.name} · in=${sub.inputToken} out=${sub.outputToken} cached=${sub.cachedInputToken}`,
                sub.finalMessage,
            );
        }
    }

    logSection("Posted comments");
    logInfo(`posted count ${provider.posted.length}`);
    if (provider.posted.length === 0) {
        logInfo("(no comments posted)");
    } else {
        for (const [index, posted] of provider.posted.entries()) {
            logBlock(postedLabel(posted, index), posted.body);
        }
    }

    logSection("Token usage");
    logInfo(`total input=${review.inputToken} output=${review.outputToken} cached=${review.cachedInputToken}`);
    for (const sub of review.subAgentList) {
        logInfo(
            `sub ${sub.index}/${sub.total} (${sub.reviewUnit.name}) in=${sub.inputToken} out=${sub.outputToken} cached=${sub.cachedInputToken}`,
        );
    }
}

async function main(): Promise<void> {
    const config = loadConfig();
    printConfig(config);

    const cloneDir = await prepareClone(config);

    try {
        const version = await resolveVersion(config, cloneDir);
        const files = await readFileMap(cloneDir);
        const diffs = await buildDiffList(version.startSha, version.headSha, cloneDir);

        logStep("review", "runPullRequestReview");
        const provider = new MockProvider(buildMockInput(config, version, files, diffs));
        const workspace = new Workspace(provider);
        await workspace.adopt(cloneDir);
        workspace.setVersion({
            headSha: version.headSha,
            startSha: version.startSha,
            baseSha: version.baseSha,
        });
        await workspace.checkout(version.headSha);
        const llmSender = createSender({
            provider: "openai",
            apiKey: config.llmApiKey,
            baseURL: config.llmBaseUrl,
            model: config.llmModel,
        });

        const review = await runPullRequestReview({
            provider,
            workspace,
            llmSender,
            prIid: 1,
            isInlineReview: config.inlineReview,
            language: config.language,
            activityId: 0,
        });

        printResult(provider, review);

        if (config.saveResult !== "none") {
            const outPath = await writeReviewResult(
                {
                    config,
                    version,
                    diffs,
                    fileCount: Object.keys(files).length,
                    review,
                    posted: provider.posted,
                    ranAt: new Date().toISOString(),
                },
                config.saveResult,
            );
            logStep("save", `wrote ${outPath}`);
        }
    } finally {
        await rm(cloneDir, { recursive: true, force: true });
        logStep("cleanup", "removed clone dir");
    }
}

main().catch((error) => {
    logError("agent:review failed", error);
    process.exit(1);
});
