import { beforeEach, describe, expect, it } from "bun:test";
import type { AgentTool } from "../../llm/loop.js";
import type { GitComment, GitDiff, GitDiffMultiLine, GitProvider } from "../../../git-provider/types.js";
import type { Workspace } from "../../../git-provider/workspace.js";
import { createMultiLineCommentTool } from "./create-multi-line-comment.js";

const FILE_DIFF: GitDiff = {
    oldPath: "a.ts",
    newPath: "a.ts",
    newFile: false,
    renamedFile: false,
    deletedFile: false,
    diff: `@@ -10,6 +10,6 @@
 context_a
 context_b
-removed_a
-removed_b
+added_a
+added_b
 context_c
 context_d
`,
};

describe("createMultiLineCommentTool", () => {
    let captured: GitDiffMultiLine[];
    let capturedAgainst: Array<string | undefined>;
    let tool: AgentTool;

    beforeEach(() => {
        captured = [];
        capturedAgainst = [];
        const provider = {
            createCommentToMultiLine: async (_prIid: number, body: string, position: GitDiffMultiLine) => {
                captured.push(position);
                return {
                    id: 1,
                    body,
                    author: "bot",
                    createdAt: "2026-01-01T00:00:00.000Z",
                } satisfies GitComment;
            },
        } as unknown as GitProvider;
        const workspace = {
            getFileDiff: async (_path: string, against?: string) => {
                capturedAgainst.push(against);
                return FILE_DIFF;
            },
        } as unknown as Workspace;
        tool = createMultiLineCommentTool(provider, workspace, 1, "English", "base", "head", "start");
    });

    function execute(start: GitDiffMultiLine["start"], end: GitDiffMultiLine["end"]) {
        return tool.execute({
            level: "problem",
            title: "t",
            body: "b",
            position: { oldPath: "a.ts", newPath: "a.ts", start, end },
        });
    }

    it("when start and end are context lines, keeps the requested type and fills the opposite side", async () => {
        const result = await execute({ type: "new", newLine: 10 }, { type: "new", newLine: 11 });

        expect(result).toMatchObject({ id: 1 });
        expect(capturedAgainst).toEqual(["start"]);
        expect(captured).toEqual([
            {
                baseSha: "base",
                headSha: "head",
                startSha: "start",
                oldPath: "a.ts",
                newPath: "a.ts",
                start: { type: "new", newLine: 10, oldLine: 10 },
                end: { type: "new", newLine: 11, oldLine: 11 },
            },
        ]);
    });

    it("when start and end are added lines, omits oldLine", async () => {
        await execute({ type: "new", newLine: 12 }, { type: "new", newLine: 13 });

        expect(captured).toHaveLength(1);
        expect(captured[0]?.start).toEqual({ type: "new", newLine: 12, oldLine: undefined });
        expect(captured[0]?.end).toEqual({ type: "new", newLine: 13, oldLine: undefined });
    });

    it("when start and end are deleted lines, omits newLine", async () => {
        await execute({ type: "old", oldLine: 12 }, { type: "old", oldLine: 13 });

        expect(captured).toHaveLength(1);
        expect(captured[0]?.start).toEqual({ type: "old", oldLine: 12, newLine: undefined });
        expect(captured[0]?.end).toEqual({ type: "old", oldLine: 13, newLine: undefined });
    });

    it("when start line is after end line on the same side, returns an error and does not call the provider", async () => {
        const result = await execute({ type: "new", newLine: 11 }, { type: "new", newLine: 10 });

        expect(result).toMatchObject({
            error: "position.start line must be <= position.end line on the same side.",
        });
        expect(captured).toHaveLength(0);
    });

    it("when a line is outside the diff hunk, returns an error and does not call the provider", async () => {
        const result = await execute({ type: "new", newLine: 10 }, { type: "new", newLine: 99 });

        expect(result).toMatchObject({ error: expect.stringContaining("not in the PR diff hunk") });
        expect(captured).toHaveLength(0);
    });
});
