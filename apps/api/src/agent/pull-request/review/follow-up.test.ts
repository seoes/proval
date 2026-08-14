import { describe, expect, it } from "bun:test";
import { MockProvider } from "../../../../mock/provider.js";
import { Workspace } from "../../../git-provider/workspace.js";
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
        compare: {
            diffList: [sampleDiff],
            commitTitleList: ["fix null check"],
        },
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

describe("fetchCompare via MockProvider", () => {
    it("returns normalized diffList and commitTitleList", async () => {
        const provider = createMockProvider();
        const result = await provider.fetchCompare("aaa", "bbb");
        expect(result.commitTitleList).toEqual(["fix null check"]);
        expect(result.diffList).toHaveLength(1);
        expect(result.diffList[0]?.newPath).toBe("src/auth.ts");
        expect(result.diffList[0]?.diff).toContain("+export const x = 1");
    });
});

describe("Workspace pushDiffList", () => {
    it("exposes push changed files and file diffs after setPushDiffList", async () => {
        const provider = createMockProvider();
        const workspace = new Workspace(provider);
        const compare = await provider.fetchCompare("aaa", "bbb");
        workspace.setPushDiffList(compare.diffList);

        expect(workspace.hasPushDiffList).toBe(true);
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
    });

    it("push tools read from pushDiffList", async () => {
        const provider = createMockProvider();
        const workspace = new Workspace(provider);
        workspace.setPushDiffList([sampleDiff]);

        const listTool = getPushChangedFileListTool(workspace);
        const diffTool = getPushFileDiffTool(workspace);
        const list = await listTool.execute({});
        const diff = await diffTool.execute({ filePath: "src/auth.ts" });
        expect(list).toHaveLength(1);
        expect(diff).toMatchObject({ newPath: "src/auth.ts" });
    });

    it("clears pushDiffList on clean", async () => {
        const provider = createMockProvider();
        const workspace = new Workspace(provider);
        workspace.setPushDiffList([sampleDiff]);
        await workspace.clean();
        expect(workspace.hasPushDiffList).toBe(false);
        await expect(workspace.pushChangedFileList()).rejects.toThrow("push diffs are not loaded");
    });
});

describe("follow-up context builders", () => {
    it("buildPushScopeContext lists push files and tool roles", () => {
        const text = buildPushScopeContext({
            previousHeadSha: "aaa111",
            headSha: "bbb222",
            commitTitleList: ["fix null check"],
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
