import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { closeUnfinishedAttemptList, readResultLineList, seededShuffle } from "./run.js";
import { collectSourceState } from "./config.js";
import { git } from "./git.js";

describe("collectSourceState", () => {
    test("detects tracked and untracked content changes while ignoring generated output", async () => {
        const dir = await mkdtemp(join(tmpdir(), "proval-bench-source-"));
        try {
            await git(["init", "-b", "main", "."], dir);
            await git(["config", "user.email", "bench@example.com"], dir);
            await git(["config", "user.name", "bench"], dir);
            await git(["config", "commit.gpgsign", "false"], dir);
            await writeFile(join(dir, ".gitignore"), "output.txt\n");
            await writeFile(join(dir, "agent.ts"), "export const value = 1;\n");
            await git(["add", "."], dir);
            await git(["commit", "-m", "fixture"], dir);
            const initial = await collectSourceState(dir);
            expect(await collectSourceState(dir)).toEqual(initial);

            await writeFile(join(dir, "agent.ts"), "export const value = 2;\n");
            const tracked = await collectSourceState(dir);
            expect(tracked.sourceStateHash).not.toBe(initial.sourceStateHash);

            await writeFile(join(dir, "helper.ts"), "export const value = 1;\n");
            const untracked = await collectSourceState(dir);
            await writeFile(join(dir, "helper.ts"), "export const value = 2;\n");
            const edited = await collectSourceState(dir);
            expect(edited.sourceStateHash).not.toBe(untracked.sourceStateHash);
            await writeFile(join(dir, "output.txt"), "generated output\n");
            expect(await collectSourceState(dir)).toEqual(edited);
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    });
});

describe("seededShuffle", () => {
    test("is deterministic for the same seed and differs across seeds", () => {
        const itemList = ["a", "b", "c", "d", "e", "f", "g", "h"];
        const first = seededShuffle(itemList, 43);
        const second = seededShuffle(itemList, 43);
        const other = seededShuffle(itemList, 44);
        expect(first).toEqual(second);
        expect(first).not.toEqual(other);
        expect([...first].sort()).toEqual([...itemList].sort());
        // Input order must not be mutated.
        expect(itemList).toEqual(["a", "b", "c", "d", "e", "f", "g", "h"]);
    });
});

describe("closeUnfinishedAttemptList", () => {
    test("classifies attempts without a terminal record as interrupted", async () => {
        const dir = await mkdtemp(join(tmpdir(), "proval-bench-run-"));
        try {
            const lineList = [
                { type: "start", runId: "r1", caseId: "case__1", repeatIndex: 1, attemptIndex: 1 },
                {
                    type: "result",
                    runId: "r1",
                    caseId: "case__1",
                    repeatIndex: 1,
                    attemptIndex: 1,
                    status: "completed",
                },
                { type: "start", runId: "r2", caseId: "case__2", repeatIndex: 1, attemptIndex: 1 },
            ];
            await writeFile(join(dir, "result.jsonl"), lineList.map((line) => JSON.stringify(line)).join("\n") + "\n");

            const count = await closeUnfinishedAttemptList(dir);
            expect(count).toBe(1);

            const after = await readResultLineList(dir);
            const interrupted = after.filter((line) => line.type === "result" && line.status === "interrupted");
            expect(interrupted.length).toBe(1);
            expect(interrupted[0]!.runId).toBe("r2");
            expect(interrupted[0]!.statusReason).toBe("process-exited-before-terminal-record");

            // A second pass must not duplicate the classification.
            expect(await closeUnfinishedAttemptList(dir)).toBe(0);

            // result.jsonl stays append only and parseable.
            const raw = await readFile(join(dir, "result.jsonl"), "utf-8");
            expect(raw.trim().split("\n").length).toBe(4);
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    });
});
