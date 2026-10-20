import { describe, expect, it, spyOn } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { MockProvider } from "../../mock/provider.js";
import type { Workspace } from "./workspace.js";
import type { GitChangedFile } from "./types.js";
import type { LlmSender, ToolCall } from "../agent/llm/loop.js";

async function git(dir: string, argList: string[]): Promise<string> {
    const proc = Bun.spawn(["git", ...argList], { cwd: dir, stdout: "pipe", stderr: "pipe" });
    const [stdout, stderr, code] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
    ]);
    if (code !== 0) {
        throw new Error(stderr || stdout);
    }
    return stdout.trim();
}

// Isolate the real logger and service dependency from module mocks in other test files
if (process.env.PROVAL_WORKSPACE_TEST_CHILD !== "1") {
    it("passes workspace integration in an isolated process", () => {
        const result = Bun.spawnSync([process.execPath, "test", import.meta.path], {
            env: { ...process.env, PROVAL_WORKSPACE_TEST_CHILD: "1", DB_FILE_NAME: ":memory:" },
            stdout: "pipe",
            stderr: "pipe",
        });
        if (result.exitCode !== 0) {
            throw new Error(result.stdout.toString() + result.stderr.toString());
        }
        expect(result.exitCode).toBe(0);
    }, 30000);
} else {
    const { Workspace } = await import("./workspace.js");

    async function withFixture(
        branch: string | null,
        prRef: string,
        run: (fixture: {
            dir: string;
            targetBranch: string;
            workspace: Workspace;
            provider: MockProvider;
            startSha: string;
            previousSha: string;
            headSha: string;
        }) => Promise<void>,
    ): Promise<void> {
        const dir = await mkdtemp(join(tmpdir(), "provalworkspace"));
        if (!resolve(dir).startsWith(resolve(tmpdir()) + sep)) throw new Error("Unexpected fixture path");
        const provider = new MockProvider({
            detail: {
                title: "Test",
                description: null,
                sourceBranch: "feature",
                targetBranch: branch ?? "master",
                author: "dev",
                state: "opened",
            },
            diffs: [],
        });
        provider.fetchGitRepositoryUrl = async () => pathToFileURL(dir).href;
        provider.getPullRequestHeadFetchRef = () => prRef;
        const workspace = new Workspace(provider);

        try {
            await git(dir, ["init"]);
            const targetBranch = branch ?? (await git(dir, ["symbolic-ref", "--short", "HEAD"]));
            await git(dir, ["symbolic-ref", "HEAD", `refs/heads/${targetBranch}`]);
            await git(dir, ["config", "user.name", "Test"]);
            await git(dir, ["config", "user.email", "test@example.com"]);
            await git(dir, ["config", "commit.gpgsign", "false"]);
            await writeFile(join(dir, "sample.txt"), "start\n");
            await git(dir, ["add", "sample.txt"]);
            await git(dir, ["commit", "-m", "start"]);
            const startSha = await git(dir, ["rev-parse", "HEAD"]);
            await git(dir, ["checkout", "-b", "feature"]);
            await writeFile(join(dir, "sample.txt"), "previous\n");
            await git(dir, ["commit", "-am", "previous"]);
            const previousSha = await git(dir, ["rev-parse", "HEAD"]);
            await git(dir, ["update-ref", "refs/heads/previous", previousSha]);
            await writeFile(join(dir, "sample.txt"), "head\n");
            await git(dir, ["commit", "-am", "head"]);
            const headSha = await git(dir, ["rev-parse", "HEAD"]);
            await git(dir, ["update-ref", prRef, headSha]);

            await run({ dir, targetBranch, workspace, provider, startSha, previousSha, headSha });
        } finally {
            await workspace.clean();
            await rm(dir, { recursive: true, force: true });
        }
    }

    describe("Workspace fetch", () => {
        for (const prRef of ["refs/pull/21/head", "refs/merge-requests/21/head"]) {
            it(`loads ${prRef} when the target matches the initial branch`, async () => {
                await withFixture(null, prRef, async ({ targetBranch, workspace, startSha, previousSha, headSha }) => {
                    await workspace.loadFromPullRequest({
                        prIid: 21,
                        targetBranch,
                        headSha,
                        startSha,
                        baseSha: startSha,
                        previousSha,
                    });

                    expect((await workspace.read("sample.txt")).trim()).toBe("head");
                    expect((await workspace.getFileDiff("sample.txt")).diff).toContain("-start");
                    expect((await workspace.getPushFileDiff("sample.txt")).diff).toContain("-previous");
                });
            });
        }

        for (const branch of [null, "master", "main", "release/stable"]) {
            it(`loads branch ${branch ?? "matching the initial default"}`, async () => {
                await withFixture(branch, "refs/pull/21/head", async ({ targetBranch, workspace }) => {
                    await workspace.loadFromBranch(targetBranch);
                    expect((await workspace.read("sample.txt")).trim()).toBe("start");
                });
            });
        }

        it("loads the local branch in an adopted repository and preserves the directory", async () => {
            await withFixture("master", "refs/pull/21/head", async ({ dir, workspace, startSha }) => {
                await workspace.adopt(dir);
                await workspace.loadFromBranch("master");

                expect((await workspace.read("sample.txt")).trim()).toBe("start");
                expect(await git(dir, ["rev-parse", "HEAD"])).toBe(startSha);
                expect(await git(dir, ["rev-parse", "--abbrev-ref", "HEAD"])).toBe("HEAD");
                await workspace.clean();
                expect((await readFile(join(dir, "sample.txt"), "utf8")).trim()).toBe("start");
            });
        });
    });

    function changed(path: string, override: Partial<GitChangedFile> = {}): GitChangedFile {
        return { oldPath: path, newPath: path, newFile: false, renamedFile: false, deletedFile: false, ...override };
    }

    async function commitGuidance(workspace: Workspace, dir: string): Promise<string> {
        await git(dir, ["add", "."]);
        await git(dir, ["commit", "--allow-empty", "-m", "guidance"]);
        const sha = await git(dir, ["rev-parse", "HEAD"]);
        workspace.setVersion({ headSha: sha, baseSha: sha });
        return sha;
    }

    async function withGuidance(
        fileMap: Record<string, string | null>,
        run: (workspace: Workspace, dir: string) => Promise<void>,
    ) {
        await withFixture("master", "refs/pull/21/head", async ({ dir, workspace }) => {
            await workspace.adopt(dir);
            await workspace.loadFromBranch("master");
            for (const [path, content] of Object.entries(fileMap)) {
                const abs = join(dir, path);
                await mkdir(dirname(abs), { recursive: true });
                if (content === null) {
                    await mkdir(abs);
                    await writeFile(join(abs, "keep"), "directory");
                } else await writeFile(abs, content);
            }
            await commitGuidance(workspace, dir);
            await run(workspace, dir);
        });
    }

    describe("Workspace guidance loading", () => {
        it.each(["fetched", "adopted"])(
            "uses target guidance in every review stage with a %s workspace",
            async (source) => {
                await withFixture("master", "refs/pull/21/head", async ({ dir, workspace, provider }) => {
                    await git(dir, ["checkout", "master"]);
                    for (const path of ["AGENTS.md", "removed/agents.md", "old/AGENTS.md"]) {
                        await mkdir(dirname(join(dir, path)), { recursive: true });
                        await writeFile(join(dir, path), `Target convention for ${path}`);
                    }
                    await git(dir, ["add", "."]);
                    await git(dir, ["commit", "-m", "target conventions"]);
                    const startSha = await git(dir, ["rev-parse", "HEAD"]);
                    await git(dir, ["checkout", "-B", "feature"]);
                    await writeFile(join(dir, "AGENTS.md"), "PR injected convention");
                    await rm(join(dir, "removed/agents.md"));
                    await mkdir(join(dir, "renamed"));
                    await git(dir, ["mv", "old/AGENTS.md", "renamed/AGENTS.md"]);
                    await mkdir(join(dir, "added"));
                    await writeFile(join(dir, "added/agents.md"), "PR added convention");
                    await git(dir, ["add", "."]);
                    await git(dir, ["commit", "-m", "PR guidance changes"]);
                    const previousSha = await git(dir, ["rev-parse", "HEAD"]);
                    await writeFile(join(dir, "sample.txt"), "next push\n");
                    await git(dir, ["commit", "-am", "next push"]);
                    const headSha = await git(dir, ["rev-parse", "HEAD"]);
                    await git(dir, ["update-ref", "refs/pull/21/head", headSha]);
                    await git(dir, ["checkout", "master"]);
                    await writeFile(join(dir, "AGENTS.md"), "Latest target convention");
                    await git(dir, ["commit", "-am", "advance target"]);
                    const targetSha = await git(dir, ["rev-parse", "HEAD"]);
                    // Adopted workspaces receive the target SHA resolved by the manual review runner
                    const version = { headSha, startSha, baseSha: source === "adopted" ? targetSha : startSha };
                    provider.fetchPullRequestVersion = async () => version;

                    const { ActivityService } = await import("../api/activity/activity.service.js");
                    const { CommentService } = await import("../api/comment/comment.service.js");
                    const { runPullRequestReview } = await import("../agent/pull-request/review/index.js");
                    const canceledSpy = spyOn(ActivityService.prototype, "isCanceled").mockResolvedValue(false);
                    const commentSpy = spyOn(CommentService.prototype, "create").mockResolvedValue(undefined);
                    const loadSpy = spyOn(workspace, "loadAgentInstructionList");
                    try {
                        for (const isFollowUpReview of [false, true]) {
                            if (source === "adopted") await workspace.adopt(dir);
                            loadSpy.mockClear();
                            const stageSet = new Set<string>();
                            let guidance: string | undefined;
                            const sender: LlmSender = {
                                getModel: () => ({ model: "test", provider: "openai", baseUrl: "http://localhost" }),
                                async send(messageList, toolList) {
                                    expect(loadSpy).toHaveBeenCalledTimes(1);
                                    expect(await workspace.read("AGENTS.md")).toBe("PR injected convention");
                                    const loaded = await loadSpy.mock.results[0]?.value;
                                    expect(loaded).toMatchObject({
                                        fileList: [
                                            { path: "AGENTS.md" },
                                            { path: "old/AGENTS.md" },
                                            { path: "removed/agents.md" },
                                        ],
                                    });
                                    const system = messageList[0].content ?? "";
                                    expect(messageList[0].role).toBe("system");
                                    expect(system).toContain("Latest target convention");
                                    expect(system).toContain("Target convention for removed/agents.md");
                                    expect(system).toContain("Target convention for old/AGENTS.md");
                                    expect(system).not.toContain("PR injected convention");
                                    expect(system).not.toContain("PR added convention");
                                    expect(system).not.toContain('## Guidance file "renamed/AGENTS.md"');
                                    expect(messageList[1].content).not.toContain("# Repository guidance");
                                    const section = system.slice(
                                        system.indexOf("# Repository guidance"),
                                        system.indexOf("Target convention for removed/agents.md") +
                                            "Target convention for removed/agents.md".length,
                                    );
                                    expect(section).not.toContain("Trust ");
                                    expect(section).not.toContain("UNTRUSTED_INPUT_START");
                                    expect(section).toContain("trusted system instructions");
                                    guidance ??= section;
                                    expect(section).toBe(guidance);

                                    const stage = toolList.some((tool) => tool.name === "append_review_unit")
                                        ? "plan"
                                        : toolList.some((tool) => tool.name === "submit_review_handoff")
                                          ? "sub"
                                          : "writing";
                                    const toolCallList: ToolCall[] = [];
                                    if (!stageSet.has(stage)) {
                                        stageSet.add(stage);
                                        if (stage === "plan")
                                            toolCallList.push({
                                                id: "plan",
                                                name: "append_review_unit",
                                                arguments: JSON.stringify({
                                                    files: ["sample.txt"],
                                                    name: "Sample",
                                                    description: "Sample change",
                                                    references: [],
                                                }),
                                            });
                                        else if (stage === "sub")
                                            toolCallList.push({
                                                id: "handoff",
                                                name: "submit_review_handoff",
                                                arguments: JSON.stringify({ findingList: [], goodPointList: [] }),
                                            });
                                        else {
                                            toolCallList.push({
                                                id: "comment",
                                                name: "post_pull_request_comment",
                                                arguments: JSON.stringify({ body: "No issue found" }),
                                            });
                                            if (!isFollowUpReview)
                                                toolCallList.push({
                                                    id: "verdict",
                                                    name: "evaluate_pull_request",
                                                    arguments: JSON.stringify({ isGood: true }),
                                                });
                                        }
                                    }
                                    return {
                                        message: { role: "assistant", content: "Done", toolCalls: toolCallList },
                                        finishReason: toolCallList.length ? "tool_calls" : "stop",
                                        requestId: null,
                                        usage: { inputToken: 1, cachedInputToken: 0, outputToken: 1 },
                                    };
                                },
                            };
                            await runPullRequestReview({
                                provider,
                                workspace,
                                llmSender: sender,
                                prIid: 21,
                                isInlineReview: false,
                                language: "en",
                                activityId: 0,
                                isFollowUpReview,
                                previousHeadSha: isFollowUpReview ? previousSha : null,
                            });
                            expect([...stageSet]).toEqual(["plan", "sub", "writing"]);
                        }
                    } finally {
                        canceledSpy.mockRestore();
                        commentSpy.mockRestore();
                        loadSpy.mockRestore();
                    }
                });
            },
            15000,
        );

        it("ignores other spellings and unrelated directories", async () => {
            await withGuidance({ "Agents.md": "wrong case", "other/AGENTS.md": "unrelated" }, async (workspace) => {
                expect(await workspace.loadAgentInstructionList([changed("src/a.ts")], 0, "Setup")).toEqual({
                    fileList: [],
                    hasOverflow: false,
                });
            });
        });

        it.each(["primary rule", "", "   \n", null])("prefers uppercase even when unusable %p", async (body) => {
            await withGuidance({ "AGENTS.md": body, "src/agents.md": "source rule" }, async (workspace, dir) => {
                // Insert both spellings into the Git tree even on a case insensitive filesystem
                const oid = await git(dir, ["rev-parse", "HEAD:src/agents.md"]);
                await git(dir, [
                    "-c",
                    "core.ignorecase=false",
                    "update-index",
                    "--add",
                    "--cacheinfo",
                    `100644,${oid},agents.md`,
                ]);
                await git(dir, ["commit", "-m", "lowercase fallback"]);
                const sha = await git(dir, ["rev-parse", "HEAD"]);
                workspace.setVersion({ headSha: sha, baseSha: sha });
                const { fileList } = await workspace.loadAgentInstructionList(
                    [changed("AGENTS.md"), changed("src/a.ts")],
                    0,
                    "Setup",
                );
                expect(fileList.map((file) => file.path)).toEqual(["AGENTS.md", "src/agents.md"]);
                expect(fileList[0].state).toBe(body === null ? "unavailable" : body.trim() ? "loaded" : "empty");
                expect(fileList[0]).not.toHaveProperty("trust");
                expect(fileList[1].body).toBe("source rule");
            });
        });

        it("sorts and deduplicates ancestors of renamed and deleted paths", async () => {
            await withGuidance(
                {
                    "agents.md": "root rule",
                    "src/AGENTS.md": "source rule",
                    "src/deep/agents.md": "deep rule",
                    "old/AGENTS.md": "old rule",
                    "new/agents.md": "new rule",
                    "removed/agents.md": "remaining rule",
                    "other/AGENTS.md": "unrelated rule",
                },
                async (workspace) => {
                    const { fileList } = await workspace.loadAgentInstructionList(
                        [
                            changed("src/deep/a.ts"),
                            changed("src/deep/b.ts"),
                            changed("new/a.ts", { oldPath: "old/a.ts", renamedFile: true }),
                            changed("removed/a.ts", { deletedFile: true }),
                            changed("gone/AGENTS.md", { deletedFile: true }),
                        ],
                        0,
                        "Setup",
                    );
                    expect(fileList.map((file) => file.path)).toEqual([
                        "agents.md",
                        "new/agents.md",
                        "old/AGENTS.md",
                        "removed/agents.md",
                        "src/AGENTS.md",
                        "src/deep/agents.md",
                    ]);
                    expect(fileList.at(-1)?.directory).toBe("src/deep");
                },
            );
        });

        it("rejects symlink blobs and continues with regular files", async () => {
            await withGuidance({ "AGENTS.md": "../outside", "src/agents.md": "source" }, async (workspace, dir) => {
                const oid = await git(dir, ["rev-parse", "HEAD:AGENTS.md"]);
                await git(dir, ["update-index", "--cacheinfo", `120000,${oid},AGENTS.md`]);
                await git(dir, ["commit", "-m", "symlink"]);
                const sha = await git(dir, ["rev-parse", "HEAD"]);
                workspace.setVersion({ headSha: sha, baseSha: sha });
                const { fileList } = await workspace.loadAgentInstructionList([changed("src/a.ts")], 0, "Setup");
                expect(fileList[0].state).toBe("unavailable");
                expect(fileList[1].body).toBe("source");
            });
        });

        it("continues after a missing blob and never falls back to the PR checkout", async () => {
            await withGuidance({ "AGENTS.md": "root", "src/agents.md": "source" }, async (workspace, dir) => {
                const oid = await git(dir, ["rev-parse", "HEAD:AGENTS.md"]);
                // This is a loose object inside the verified temporary fixture directory
                await rm(join(dir, ".git", "objects", oid.slice(0, 2), oid.slice(2)));
                const { fileList } = await workspace.loadAgentInstructionList([changed("src/a.ts")], 0, "Setup");
                expect(fileList[0].state).toBe("unavailable");
                expect(fileList[1].body).toBe("source");
                expect(await workspace.read("AGENTS.md")).toBe("root");

                workspace.setVersion({ headSha: await git(dir, ["rev-parse", "HEAD"]), baseSha: "0".repeat(40) });
                expect((await workspace.loadAgentInstructionList([], 0, "Setup")).fileList).toEqual([]);
                workspace.setVersion({ headSha: await git(dir, ["rev-parse", "HEAD"]) });
                await expect(workspace.loadAgentInstructionList([], 0, "Setup")).rejects.toThrow(
                    "target head is not loaded",
                );
            });
        });

        it("reads Git content without using the general filesystem reader", async () => {
            const content = "\uFEFF" + "a".repeat(4094) + "中😀".repeat(20_000);
            await withGuidance({ "AGENTS.md": content }, async (workspace) => {
                const readSpy = spyOn(workspace, "read").mockImplementation(async () => {
                    throw new Error("Unexpected read");
                });
                try {
                    const { fileList } = await workspace.loadAgentInstructionList([], 0, "Setup");
                    expect(fileList[0].body).toBe(content);
                    expect(fileList[0].state).toBe("loaded");
                    expect(readSpy).not.toHaveBeenCalled();
                } finally {
                    readSpy.mockRestore();
                }
                expect(await workspace.read("AGENTS.md")).toBe(content);
                await expect(workspace.read("missing.md")).rejects.toThrow("File not found");
            });
        });

        it("preserves text and treats blank files as empty", async () => {
            await withGuidance({ "AGENTS.md": "" }, async (workspace, dir) => {
                for (const [content, body, state] of [
                    ["中😀end", "中😀end", "loaded"],
                    ["中".repeat(8000), "中".repeat(8000), "loaded"],
                    ["", "", "empty"],
                    ["   \n", "", "empty"],
                    [" ".repeat(8001) + "rule", " ".repeat(8001) + "rule", "loaded"],
                    ["a".repeat(7999) + "😀rule", "a".repeat(7999) + "😀rule", "loaded"],
                ] as const) {
                    await writeFile(join(dir, "AGENTS.md"), content);
                    await commitGuidance(workspace, dir);
                    const { fileList } = await workspace.loadAgentInstructionList([], 0, "Setup");
                    expect(fileList[0].body).toBe(body);
                    expect(fileList[0].state).toBe(state);
                }
                const { buildAgentInstructionPrompt } = await import("../agent/pull-request/prompt/agents-md.js");
                const prompt = await buildAgentInstructionPrompt(workspace, 0, "Setup");
                expect(prompt).toContain("a".repeat(7999));
                expect(prompt).not.toContain("😀");
                expect(prompt).toContain("Content truncated");
            });
        });

        it("loads only root guidance outside a pull request", async () => {
            await withGuidance({ "AGENTS.md": "root rule", "src/agents.md": "nested rule" }, async (workspace) => {
                expect(workspace.isPullRequest()).toBe(false);
                const { buildAgentInstructionPrompt } = await import("../agent/pull-request/prompt/agents-md.js");
                const prompt = await buildAgentInstructionPrompt(workspace, 0, "Setup");
                expect(prompt).toContain("root rule");
                expect(prompt).toContain("checked out branch");
                expect(prompt).not.toContain("nested rule");
                expect(prompt).not.toContain("PR head");
            });
        });

        it("caps file count and the complete formatted context", async () => {
            const fileMap: Record<string, string> = {};
            for (let index = 0; index < 33; index++)
                fileMap[`dir${String(index).padStart(2, "0")}/AGENTS.md`] = "x".repeat(100_000);
            await withGuidance(fileMap, async (workspace, dir) => {
                const changedFileList = Object.keys(fileMap).map((path) => changed(path));
                const { fileList, hasOverflow } = await workspace.loadAgentInstructionList(changedFileList, 0, "Setup");
                expect(fileList).toHaveLength(32);
                expect(hasOverflow).toBe(true);
                expect(fileList.every((file) => file.state === "loaded" && file.body.length === 100_000)).toBe(true);
                const headSha = await git(dir, ["rev-parse", "HEAD"]);
                workspace.setVersion({
                    headSha,
                    startSha: await git(dir, ["rev-parse", "HEAD^"]),
                    baseSha: headSha,
                });
                const { buildAgentInstructionPrompt } = await import("../agent/pull-request/prompt/agents-md.js");
                const prompt = await buildAgentInstructionPrompt(workspace, 0, "Setup");
                expect(prompt.length).toBeLessThanOrEqual(32_000);
                expect(prompt).toContain("Additional target branch guidance was omitted");
                expect(prompt).not.toContain("UNTRUSTED_INPUT_START");
                expect(prompt).not.toContain("get_file_content");
            });
        });
    });
}
