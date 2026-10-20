import { describe, expect, it } from "bun:test";
import {
    isAllowedTargetBranch,
    validateAllowedBranchList,
} from "./allowed-target-branch.js";

describe("isAllowedTargetBranch", () => {
    it("allows every branch when the list is empty", () => {
        expect(isAllowedTargetBranch([], "main")).toBe(true);
        expect(isAllowedTargetBranch([], "")).toBe(true);
    });

    it("matches the whole branch name only", () => {
        expect(isAllowedTargetBranch(["dev"], "dev")).toBe(true);
        expect(isAllowedTargetBranch(["dev", "main"], "main")).toBe(true);
        expect(isAllowedTargetBranch(["release/1.2"], "release/1.2")).toBe(
            true,
        );

        for (const branch of [
            "development",
            "Dev",
            "dev-king",
            "release/dev",
            "github/dev-king/feat-something",
            "refs/heads/dev",
            "owner:dev",
            "origin/dev",
            "",
            "release",
        ]) {
            expect(isAllowedTargetBranch(["dev"], branch)).toBe(false);
        }
        expect(isAllowedTargetBranch(["release/1.2"], "release")).toBe(false);
    });
});

describe("validateAllowedBranchList", () => {
    it("accepts valid branch lists", () => {
        expect(validateAllowedBranchList(["dev", "main"])).toEqual([
            "dev",
            "main",
        ]);
        expect(validateAllowedBranchList([" main ", "dev"])).toEqual([
            "main",
            "dev",
        ]);
        expect(validateAllowedBranchList(["main", "main", "dev"])).toEqual([
            "main",
            "dev",
        ]);
        expect(validateAllowedBranchList(["release/1.2"])).toEqual([
            "release/1.2",
        ]);
        expect(
            validateAllowedBranchList(["github/dev-king/feat-something"]),
        ).toEqual(["github/dev-king/feat-something"]);
        expect(validateAllowedBranchList(["Dev"])).toEqual(["Dev"]);
    });

    it("rejects invalid input", () => {
        const invalidList = [
            "dev, main" as never,
            null as never,
            [1] as never,
            [""],
            ["dev king"],
            ["dev, main"],
            ["owner:dev"],
            ["refs/heads/main"],
            ["refs/remotes/origin/dev"],
        ];
        for (const input of invalidList) {
            expect(() => validateAllowedBranchList(input)).toThrow(Error);
        }
    });

    it("rejects oversized lists and names", () => {
        expect(() =>
            validateAllowedBranchList(
                Array.from({ length: 33 }, (_, i) => `branch-${i}`),
            ),
        ).toThrow(Error);
        expect(() =>
            validateAllowedBranchList(["a".repeat(256)]),
        ).toThrow(Error);
    });
});
