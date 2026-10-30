import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { git } from "./load/git.js";
import { collectSourceState } from "./config.js";

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
