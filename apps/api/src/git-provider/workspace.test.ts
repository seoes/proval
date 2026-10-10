import { describe, expect, it, spyOn } from "bun:test";
import * as fs from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { MockProvider } from "../../mock/provider.js";
import type { Workspace } from "./workspace.js";

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
            startSha: string;
            previousSha: string;
            headSha: string;
        }) => Promise<void>,
    ): Promise<void> {
        const dir = await mkdtemp(join(tmpdir(), "provalworkspace"));
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

            await run({ dir, targetBranch, workspace, startSha, previousSha, headSha });
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

    describe("Workspace bounded read", () => {
        it("stops reading a large file after the prefix and closes the stream", async () => {
            await withFixture("master", "refs/pull/21/head", async ({ dir, workspace }) => {
                await workspace.adopt(dir);
                await workspace.loadFromBranch("master");
                const content = "\uFEFF" + "a".repeat(4094) + "中😀".repeat(20_000);
                await writeFile(join(dir, "guidance.md"), content);
                const streamSpy = spyOn(fs, "createReadStream");
                try {
                    expect(
                        await workspace.read("guidance.md", { regularFileOnly: true, maxCharacterCount: 8001 }),
                    ).toBe(content.slice(0, 8001));
                    const stream = streamSpy.mock.results[0]?.value as fs.ReadStream;
                    expect(stream.bytesRead).toBeGreaterThan(0);
                    expect(stream.bytesRead).toBeLessThan(32_768);
                    expect(stream.destroyed).toBe(true);
                    expect(await workspace.read("guidance.md", { maxCharacterCount: 0 })).toBe("");
                    expect(await workspace.read("guidance.md")).toBe(content);
                    expect(streamSpy).toHaveBeenCalledTimes(1);
                } finally {
                    streamSpy.mockRestore();
                }
            });
        });

        it("decodes multibyte text across small chunks and handles empty or missing files", async () => {
            await withFixture("master", "refs/pull/21/head", async ({ dir, workspace }) => {
                await workspace.adopt(dir);
                await workspace.loadFromBranch("master");
                await writeFile(join(dir, "guidance.md"), "中😀end");
                expect(await workspace.read("guidance.md", { maxCharacterCount: 1 })).toBe("中");
                expect(await workspace.read("guidance.md", { maxCharacterCount: 3 })).toBe("中😀");
                expect(await workspace.read("guidance.md", { maxCharacterCount: 100 })).toBe("中😀end");
                await writeFile(join(dir, "guidance.md"), "");
                expect(await workspace.read("guidance.md", { maxCharacterCount: 8001 })).toBe("");
                await expect(workspace.read("missing.md", { maxCharacterCount: 8001 })).rejects.toThrow(
                    "File not found",
                );
                for (const maxCharacterCount of [-1, 1.5, Infinity, NaN]) {
                    await expect(workspace.read("guidance.md", { maxCharacterCount })).rejects.toBeInstanceOf(
                        RangeError,
                    );
                }
            });
        });
    });
}
