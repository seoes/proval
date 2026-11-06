import { describe, expect, test } from "bun:test";
import { flagBoolean, flagString, parseCommandLine } from "./args.js";

describe("parseCommandLine", () => {
    test("separates the command path from the flags", () => {
        const parsed = parseCommandLine(["repo", "list", "--json"]);
        expect(parsed.pathList).toEqual(["repo", "list"]);
        expect(parsed.mode).toBe("json");
    });

    test("reads a flag value given with a space or an equals sign", () => {
        expect(flagString(parseCommandLine(["--url", "https://x"]).flagMap, "url")).toBe("https://x");
        expect(flagString(parseCommandLine(["--url=https://x"]).flagMap, "url")).toBe("https://x");
    });

    test("treats a flag with no value as a switch", () => {
        const parsed = parseCommandLine(["activity", "cancel", "7", "--yes"]);
        expect(flagBoolean(parsed.flagMap, "yes")).toBe(true);
        expect(parsed.pathList).toEqual(["activity", "cancel", "7"]);
    });

    test("does not swallow the next flag as a value", () => {
        const parsed = parseCommandLine(["--force", "--json"]);
        expect(flagBoolean(parsed.flagMap, "force")).toBe(true);
        expect(parsed.mode).toBe("json");
    });

    test("agent mode wins over json, since it is the more specific request", () => {
        expect(parseCommandLine(["--json", "--agent"]).mode).toBe("agent");
    });

    test("defaults to the human readable table", () => {
        expect(parseCommandLine(["repo", "list"]).mode).toBe("table");
    });

    test("stops parsing flags after a bare --, so a value may look like a flag", () => {
        const parsed = parseCommandLine(["repo", "set", "1", "--", "--weird-value"]);
        expect(parsed.pathList).toEqual(["repo", "set", "1", "--weird-value"]);
        expect(parsed.flagMap["weird-value"]).toBeUndefined();
    });

    test("recognises help as a flag or as a word", () => {
        expect(parseCommandLine(["--help"]).help).toBe(true);
        expect(parseCommandLine(["-h"]).help).toBe(true);
        expect(parseCommandLine(["help"]).help).toBe(true);
    });

    test("returns an empty path for no arguments, which the caller shows help for", () => {
        expect(parseCommandLine([]).pathList).toEqual([]);
    });
});
