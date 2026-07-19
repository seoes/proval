import { beforeEach, describe, expect, it } from "bun:test";
import type { AgentTool } from "../../llm/loop.js";
import type { GitComment, GitDiff, GitDiffSingleLine, GitProvider } from "../../../git-provider/types.js";
import { createSingleLineCommentTool } from "./create-single-line-comment.js";

const FILE_DIFF: GitDiff = {
    oldPath: "a.ts",
    newPath: "a.ts",
    newFile: false,
    renamedFile: false,
    deletedFile: false,
    diff: `@@ -10,3 +10,4 @@
 context_before
-removed
+added
 context_after
`,
};

describe("createSingleLineCommentTool", () => {
    let captured: GitDiffSingleLine[];
    let tool: AgentTool;

    beforeEach(() => {
        captured = [];
        const provider = {
            fetchFileDiff: async () => FILE_DIFF,
            createCommentToSingleLine: async (_prIid: number, body: string, position: GitDiffSingleLine) => {
                captured.push(position);
                return {
                    id: 1,
                    body,
                    author: "bot",
                    createdAt: "2026-01-01T00:00:00.000Z",
                } satisfies GitComment;
            },
        } as unknown as GitProvider;
        tool = createSingleLineCommentTool(provider, 1, "English", "base", "head", "start");
    });

    function execute(position: { newLine?: number; oldLine?: number }) {
        return tool.execute({
            level: "problem",
            title: "t",
            body: "b",
            position: { oldPath: "a.ts", newPath: "a.ts", ...position },
        });
    }

    it("when newLine points at an added hunk line, passes only newLine to the provider", async () => {
        const result = await execute({ newLine: 11 });

        expect(result).toMatchObject({ id: 1 });
        expect(captured).toEqual([
            {
                baseSha: "base",
                headSha: "head",
                startSha: "start",
                oldPath: "a.ts",
                newPath: "a.ts",
                newLine: 11,
                oldLine: undefined,
            },
        ]);
    });

    it("when oldLine points at a deleted hunk line, passes only oldLine to the provider", async () => {
        await execute({ oldLine: 11 });

        expect(captured).toHaveLength(1);
        expect(captured[0]?.newLine).toBeUndefined();
        expect(captured[0]?.oldLine).toBe(11);
    });

    it("when newLine points at a context hunk line, fills both newLine and oldLine for the provider", async () => {
        await execute({ newLine: 10 });

        expect(captured).toHaveLength(1);
        expect(captured[0]?.newLine).toBe(10);
        expect(captured[0]?.oldLine).toBe(10);
    });

    it("when oldLine points at a context hunk line, fills both newLine and oldLine for the provider", async () => {
        await execute({ oldLine: 12 });

        expect(captured).toHaveLength(1);
        expect(captured[0]?.newLine).toBe(12);
        expect(captured[0]?.oldLine).toBe(12);
    });

    it("when newLine is outside the diff hunk, returns an error and does not call the provider", async () => {
        const result = await execute({ newLine: 99 });

        expect(result).toMatchObject({ error: expect.stringContaining("not in the PR diff hunk") });
        expect(captured).toHaveLength(0);
    });
});
