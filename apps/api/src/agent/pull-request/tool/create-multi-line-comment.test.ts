import { beforeEach, describe, expect, it } from "bun:test";
import type { AgentTool } from "../../llm/loop.js";
import type { GitComment, GitDiffMultiLine, GitProvider } from "../../../git-provider/types.js";
import { createMultiLineCommentTool } from "./create-multi-line-comment.js";

describe("createMultiLineCommentTool", () => {
    let captured: GitDiffMultiLine[];
    let tool: AgentTool;

    beforeEach(() => {
        captured = [];
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
        tool = createMultiLineCommentTool(provider, 1, "English", "base", "head", "start");
    });

    function execute(start: GitDiffMultiLine["start"], end: GitDiffMultiLine["end"]) {
        return tool.execute({
            level: "problem",
            title: "t",
            body: "b",
            position: { oldPath: "a.ts", newPath: "a.ts", start, end },
        });
    }

    it("when start and end form a valid new-side range, passes the range position to the provider", async () => {
        const start = { type: "new" as const, newLine: 11, oldLine: 0 };
        const end = { type: "new" as const, newLine: 12, oldLine: 0 };
        const result = await execute(start, end);

        expect(result).toMatchObject({ id: 1 });
        expect(captured).toEqual([
            {
                baseSha: "base",
                headSha: "head",
                startSha: "start",
                oldPath: "a.ts",
                newPath: "a.ts",
                start,
                end,
            },
        ]);
    });

    it("when start and end form a valid old-side range, passes the range position to the provider", async () => {
        const start = { type: "old" as const, newLine: 0, oldLine: 10 };
        const end = { type: "old" as const, newLine: 0, oldLine: 11 };
        await execute(start, end);

        expect(captured).toHaveLength(1);
        expect(captured[0]?.start).toEqual(start);
        expect(captured[0]?.end).toEqual(end);
    });

    it("when start line is after end line on the same side, returns an error and does not call the provider", async () => {
        const result = await execute(
            { type: "new", newLine: 12, oldLine: 0 },
            { type: "new", newLine: 11, oldLine: 0 },
        );

        expect(result).toMatchObject({
            error: "position.start line must be <= position.end line on the same side.",
        });
        expect(captured).toHaveLength(0);
    });
});
