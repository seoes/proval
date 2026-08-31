import { describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MockProvider } from "../../../../mock/provider.js";
import { Workspace } from "../../../git-provider/workspace.js";
import { getChangedFileListTool } from "../tool/get-changed-file-list.js";
import { getFileDiffTool } from "../tool/get-file-diff.js";
import { getPushChangedFileListTool } from "../tool/get-push-changed-file-list.js";
import { getPushFileDiffTool } from "../tool/get-push-file-diff.js";
import { buildFollowUpThreadContext, buildPushScopeContext } from "./follow-up.context.js";
import { FOLLOW_UP_PUSH_PLAN_HINT, FOLLOW_UP_REVIEW_RULE } from "./follow-up.prompt.js";

const sampleDiff = {
    oldPath: "src/auth.ts",
    newPath: "src/auth.ts",
    newFile: false,
    renamedFile: false,
    deletedFile: false,
    diff: "@@ -1,3 +1,4 @@\n+export const x = 1\n",
};

async function git(cwd: string, args: string[]): Promise<string> {
    const proc = Bun.spawn(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe" });
    const [stdout, stderr, code] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
    ]);
    if (code !== 0) {
        throw new Error(`git ${args[0]} failed (${code}): ${stderr || stdout}`);
    }
    return stdout.trim();
}

async function createWorkspaceGitFixture(): Promise<{
    dir: string;
    startSha: string;
    previousSha: string;
    headSha: string;
}> {
    const dir = await mkdtemp(join(tmpdir(), "proval-ws-"));
    await git(dir, ["init"]);
    await git(dir, ["config", "user.email", "test@example.com"]);
    await git(dir, ["config", "user.name", "Test"]);
    await git(dir, ["config", "commit.gpgsign", "false"]);
    await mkdir(join(dir, "src"), { recursive: true });
    await writeFile(join(dir, "src/auth.ts"), "const a = 1\n");
    await git(dir, ["add", "."]);
    await git(dir, ["commit", "-m", "start"]);
    const startSha = await git(dir, ["rev-parse", "HEAD"]);

    await writeFile(join(dir, "src/auth.ts"), "const a = 1\nexport const x = 0\n");
    await git(dir, ["add", "."]);
    await git(dir, ["commit", "-m", "previous"]);
    const previousSha = await git(dir, ["rev-parse", "HEAD"]);

    await writeFile(join(dir, "src/auth.ts"), "const a = 1\nexport const x = 1\n");
    await git(dir, ["add", "."]);
    await git(dir, ["commit", "-m", "head"]);
    const headSha = await git(dir, ["rev-parse", "HEAD"]);

    return { dir, startSha, previousSha, headSha };
}

async function createStartBaseHeadFixture(): Promise<{
    dir: string;
    startSha: string;
    baseSha: string;
    headSha: string;
}> {
    const dir = await mkdtemp(join(tmpdir(), "proval-ws-sbh-"));
    await git(dir, ["init"]);
    await git(dir, ["config", "user.email", "test@example.com"]);
    await git(dir, ["config", "user.name", "Test"]);
    await git(dir, ["config", "commit.gpgsign", "false"]);
    await mkdir(join(dir, "src"), { recursive: true });
    await writeFile(join(dir, "src/auth.ts"), "const a = 1\n");
    await git(dir, ["add", "."]);
    await git(dir, ["commit", "-m", "start"]);
    const startSha = await git(dir, ["rev-parse", "HEAD"]);

    await git(dir, ["branch", "feature"]);
    await writeFile(join(dir, "src/extra.ts"), "export const fromMain = 1\n");
    await git(dir, ["add", "."]);
    await git(dir, ["commit", "-m", "base"]);
    const baseSha = await git(dir, ["rev-parse", "HEAD"]);

    await git(dir, ["checkout", "feature"]);
    await writeFile(join(dir, "src/auth.ts"), "const a = 1\nexport const x = 1\n");
    await git(dir, ["add", "."]);
    await git(dir, ["commit", "-m", "head"]);
    const headSha = await git(dir, ["rev-parse", "HEAD"]);

    return { dir, startSha, baseSha, headSha };
}

function createMockProvider() {
    return new MockProvider({
        detail: {
            title: "Test",
            description: null,
            sourceBranch: "feature",
            targetBranch: "main",
            author: "dev",
            state: "opened",
        },
        diffs: [sampleDiff],
        commentList: [
            {
                id: 10,
                body: "Please fix the null check in auth",
                author: "reviewer",
                createdAt: "2026-08-13T00:00:00Z",
            },
        ],
        inlineReviewList: [
            {
                id: "thread-1",
                path: "src/auth.ts",
                createdAt: "2026-08-13T00:00:00Z",
                isResolved: false,
                start: { type: "new", newLine: 1 },
                end: { type: "new", newLine: 1 },
                commentList: [
                    {
                        id: 20,
                        body: "Missing guard here",
                        author: "bot",
                        createdAt: "2026-08-13T00:01:00Z",
                    },
                ],
            },
        ],
    });
}

describe("Workspace git diffs", () => {
    it("exposes push changed files and file diffs after load with previousRef", async () => {
        const fixture = await createWorkspaceGitFixture();
        try {
            const provider = createMockProvider();
            const workspace = new Workspace(provider);
            await workspace.adopt(fixture.dir);
            workspace.setVersion({
                headSha: fixture.headSha,
                startSha: fixture.startSha,
                previousSha: fixture.previousSha,
            });
            await workspace.checkout(fixture.headSha);

            const fileList = await workspace.pushChangedFileList();
            expect(fileList).toEqual([
                {
                    oldPath: "src/auth.ts",
                    newPath: "src/auth.ts",
                    newFile: false,
                    renamedFile: false,
                    deletedFile: false,
                },
            ]);
            const diff = await workspace.getPushFileDiff("src/auth.ts");
            expect(diff.diff).toContain("+export const x = 1");
        } finally {
            await rm(fixture.dir, { recursive: true, force: true });
        }
    });

    it("push tools read from local git diff", async () => {
        const fixture = await createWorkspaceGitFixture();
        try {
            const provider = createMockProvider();
            const workspace = new Workspace(provider);
            await workspace.adopt(fixture.dir);
            workspace.setVersion({
                headSha: fixture.headSha,
                startSha: fixture.startSha,
                previousSha: fixture.previousSha,
            });
            await workspace.checkout(fixture.headSha);

            const listTool = getPushChangedFileListTool(workspace);
            const diffTool = getPushFileDiffTool(workspace);
            const list = await listTool.execute({});
            const diff = await diffTool.execute({ filePath: "src/auth.ts" });
            expect(list).toHaveLength(1);
            expect(diff).toMatchObject({ newPath: "src/auth.ts" });
        } finally {
            await rm(fixture.dir, { recursive: true, force: true });
        }
    });

    it("clears previousRef on clean", async () => {
        const fixture = await createWorkspaceGitFixture();
        try {
            const provider = createMockProvider();
            const workspace = new Workspace(provider);
            await workspace.adopt(fixture.dir);
            workspace.setVersion({
                headSha: fixture.headSha,
                startSha: fixture.startSha,
                previousSha: fixture.previousSha,
            });
            await workspace.checkout(fixture.headSha);
            await workspace.clean();
            await expect(workspace.pushChangedFileList()).rejects.toThrow("Workspace is not loaded.");
        } finally {
            await rm(fixture.dir, { recursive: true, force: true });
        }
    });

    it("diffs start-head and base-head separately", async () => {
        const fixture = await createStartBaseHeadFixture();
        try {
            const provider = createMockProvider();
            const workspace = new Workspace(provider);
            await workspace.adopt(fixture.dir);
            workspace.setVersion({
                headSha: fixture.headSha,
                startSha: fixture.startSha,
                baseSha: fixture.baseSha,
            });
            await workspace.checkout(fixture.headSha);

            const startList = await workspace.changedFiles("start");
            expect(startList.map((file) => file.newPath)).toEqual(["src/auth.ts"]);
            const startDiff = await workspace.getFileDiff("src/auth.ts", "start");
            expect(startDiff.diff).toContain("+export const x = 1");

            const baseList = await workspace.changedFiles("base");
            const basePathList = baseList.map((file) => file.newPath || file.oldPath);
            expect(basePathList).toContain("src/auth.ts");
            expect(basePathList).toContain("src/extra.ts");
            const extra = baseList.find((file) => file.oldPath === "src/extra.ts" || file.newPath === "src/extra.ts");
            expect(extra?.deletedFile).toBe(true);
        } finally {
            await rm(fixture.dir, { recursive: true, force: true });
        }
    });

    it("throws when the requested against object is missing", async () => {
        const fixture = await createWorkspaceGitFixture();
        try {
            const provider = createMockProvider();
            const workspace = new Workspace(provider);
            await workspace.adopt(fixture.dir);
            workspace.setVersion({
                headSha: fixture.headSha,
                startSha: "0".repeat(40),
                baseSha: fixture.headSha,
            });
            await workspace.checkout(fixture.headSha);
            await expect(workspace.getFileDiff("src/auth.ts", "start")).rejects.toThrow("Command failed");
        } finally {
            await rm(fixture.dir, { recursive: true, force: true });
        }
    });

    it("get_file_diff and get_changed_file_list pass against through", async () => {
        const fixture = await createStartBaseHeadFixture();
        try {
            const provider = createMockProvider();
            const workspace = new Workspace(provider);
            await workspace.adopt(fixture.dir);
            workspace.setVersion({
                headSha: fixture.headSha,
                startSha: fixture.startSha,
                baseSha: fixture.baseSha,
            });
            await workspace.checkout(fixture.headSha);

            const listTool = getChangedFileListTool(workspace);
            const diffTool = getFileDiffTool(workspace);
            const startList = await listTool.execute({});
            const baseList = await listTool.execute({ against: "base" });
            expect(Array.isArray(startList)).toBe(true);
            expect(Array.isArray(baseList)).toBe(true);
            if (!Array.isArray(startList) || !Array.isArray(baseList)) {
                return;
            }
            expect(startList).toHaveLength(1);
            expect(baseList.length).toBeGreaterThan(1);
            const startDiff = await diffTool.execute({ filePath: "src/auth.ts" });
            expect(startDiff).toMatchObject({ newPath: "src/auth.ts" });
        } finally {
            await rm(fixture.dir, { recursive: true, force: true });
        }
    });
});

describe("follow-up context builders", () => {
    it("buildPushScopeContext lists push files and tool roles", () => {
        const text = buildPushScopeContext({
            previousHeadSha: "aaa111",
            headSha: "bbb222",
            pushPathList: ["src/auth.ts"],
        });
        expect(text).toContain("Previous reviewed head: aaa111");
        expect(text).toContain("src/auth.ts");
        expect(text).toContain("get_push_changed_file_list");
        expect(text).toContain("get_changed_file_list / get_file_diff — FULL PR");
    });

    it("buildFollowUpThreadContext includes comment and inline previews", async () => {
        const provider = createMockProvider();
        const text = await buildFollowUpThreadContext(provider, 1);
        expect(text).toContain("Please fix the null check");
        expect(text).toContain("Missing guard here");
        expect(text).toContain("thread thread-1");
        expect(text).toContain("get_pull_request_comment");
    });

    it("buildFollowUpThreadContext keeps the newest 50 comments, not the oldest page", async () => {
        const commentList = Array.from({ length: 51 }, (_, i) => ({
            id: i + 1,
            body: `comment-body-${i}`,
            author: "reviewer",
            createdAt: `2026-08-13T00:${String(i).padStart(2, "0")}:00Z`,
        }));
        const provider = new MockProvider({
            detail: {
                title: "Test",
                description: null,
                sourceBranch: "feature",
                targetBranch: "main",
                author: "dev",
                state: "opened",
            },
            diffs: [sampleDiff],
            commentList,
        });
        const text = await buildFollowUpThreadContext(provider, 1);
        expect(text).toContain("comment-body-50");
        expect(text).not.toContain("comment-body-0");
    });

    it("buildFollowUpThreadContext keeps the newest 50 inline threads, not the oldest page", async () => {
        const inlineReviewList = Array.from({ length: 51 }, (_, i) => ({
            id: `thread-${i}`,
            path: "src/auth.ts",
            createdAt: `2026-08-13T00:${String(i).padStart(2, "0")}:00Z`,
            isResolved: false,
            start: { type: "new" as const, newLine: 1 },
            end: { type: "new" as const, newLine: 1 },
            commentList: [
                {
                    id: 1000 + i,
                    body: `inline-body-${i}`,
                    author: "bot",
                    createdAt: `2026-08-13T00:${String(i).padStart(2, "0")}:00Z`,
                },
            ],
        }));
        const provider = new MockProvider({
            detail: {
                title: "Test",
                description: null,
                sourceBranch: "feature",
                targetBranch: "main",
                author: "dev",
                state: "opened",
            },
            diffs: [sampleDiff],
            inlineReviewList,
        });
        const text = await buildFollowUpThreadContext(provider, 1);
        expect(text).toContain("inline-body-50");
        expect(text).toContain("thread thread-50");
        expect(text).not.toContain("inline-body-0");
        expect(text).not.toContain("thread thread-0");
    });
});

describe("MockProvider comment ordering", () => {
    it("fetchPullRequestCommentList sorts by createdAt ascending without options", async () => {
        const provider = new MockProvider({
            detail: {
                title: "Test",
                description: null,
                sourceBranch: "feature",
                targetBranch: "main",
                author: "dev",
                state: "opened",
            },
            diffs: [sampleDiff],
            commentList: [
                {
                    id: 2,
                    body: "newer",
                    author: "a",
                    createdAt: "2026-08-13T02:00:00Z",
                },
                {
                    id: 1,
                    body: "older",
                    author: "a",
                    createdAt: "2026-08-13T01:00:00Z",
                },
            ],
        });
        const commentList = await provider.fetchPullRequestCommentList(1);
        expect(commentList.map((c) => c.body)).toEqual(["older", "newer"]);
    });
});

describe("follow-up prompts", () => {
    it("push plan hint requires push coverage", () => {
        expect(FOLLOW_UP_PUSH_PLAN_HINT).toContain("get_push_changed_file_list");
        expect(FOLLOW_UP_PUSH_PLAN_HINT).toContain("NOT the full PR");
    });

    it("writing rule asks for natural follow-on tone", () => {
        expect(FOLLOW_UP_REVIEW_RULE).toContain("natural follow-on");
        expect(FOLLOW_UP_REVIEW_RULE).toContain("get_push_file_diff");
    });
});
