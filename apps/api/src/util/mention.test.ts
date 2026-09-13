import { describe, expect, it } from "bun:test";
import { isBotMentioned } from "./mention.js";

const provalAliasList = ["proval"];

describe("isBotMentioned", () => {
    it("matches case insensitive mention", () => {
        expect(isBotMentioned("@Proval", provalAliasList)).toBe(true);
        expect(isBotMentioned("@proval", provalAliasList)).toBe(true);
    });

    it("matches mention in prose", () => {
        expect(isBotMentioned("hey @proval please", provalAliasList)).toBe(true);
    });

    it("matches mention at start and after punctuation", () => {
        expect(isBotMentioned("@proval", provalAliasList)).toBe(true);
        expect(isBotMentioned("(@proval)", provalAliasList)).toBe(true);
    });

    it("matches GitHub bot suffix when alias is short name", () => {
        expect(isBotMentioned("@proval[bot]", provalAliasList)).toBe(true);
    });

    it("matches when alias includes bot suffix", () => {
        expect(isBotMentioned("@acme-proval[bot]", ["acme-proval[bot]"])).toBe(true);
    });

    it("rejects email addresses", () => {
        expect(isBotMentioned("dev@proval.com", provalAliasList)).toBe(false);
    });

    it("rejects longer usernames with shared prefix", () => {
        expect(isBotMentioned("@proval-helper", provalAliasList)).toBe(false);
        expect(isBotMentioned("@provalbot", provalAliasList)).toBe(false);
    });

    it("ignores mentions inside fenced code", () => {
        expect(isBotMentioned("```\n@proval\n```", provalAliasList)).toBe(false);
    });

    it("ignores mentions inside inline code", () => {
        expect(isBotMentioned("use `@proval` here", provalAliasList)).toBe(false);
    });

    it("returns false for empty alias list", () => {
        expect(isBotMentioned("@proval", [])).toBe(false);
        expect(isBotMentioned("@proval", ["", "  "])).toBe(false);
    });
});
