import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadManifest } from "../load/manifest.js";
import type { ChatComplete } from "./client.js";
import { loadGoldenByUrl } from "./golden.js";
import { evaluateReview, fbeta, joinInlineBody, parseDedupGroupList, scoreProfile } from "./logic.js";
import { EXTRACT_PROMPT, formatPrompt } from "./prompt.js";
import { scoreBatch } from "./run.js";

describe("formatPrompt", () => {
    test("renders python doubled braces and named placeholders", () => {
        const rendered = formatPrompt(EXTRACT_PROMPT, { comment: "the review" });
        expect(rendered).toContain("Code Review Comment:\nthe review");
        expect(rendered).toContain('{"issues": [');
        expect(rendered).not.toContain("{{");
    });
});

describe("parseDedupGroupList", () => {
    test("accepts a full partition and rejects a missing index", () => {
        expect(parseDedupGroupList('{"groups": [[0, 2], [1]]}', 3)).toEqual([[0, 2], [1]]);
        expect(parseDedupGroupList('```json\n{"groups": [[0]]}\n```', 1)).toEqual([[0]]);
        expect(parseDedupGroupList('{"groups": [[0]]}', 2)).toBeNull();
        expect(parseDedupGroupList('{"groups": [[0, 0]]}', 1)).toBeNull();
    });
});

describe("evaluateReview", () => {
    const goldenCommentList = [
        { comment: "null crash", severity: "High", category: "bug" },
        { comment: "style nit", severity: "Low", category: "style" },
    ];

    test("ignores a zero confidence match and does not count a duplicate sibling as a false positive", () => {
        const evaluation = evaluateReview(
            goldenCommentList,
            ["null crash inline", "null crash summary", "unrelated"],
            [
                { match: true, confidence: 0 },
                { match: true, confidence: 0.4 },
                { match: false, confidence: 0.2 },
                { match: false, confidence: 0.1 },
                { match: false, confidence: 0.1 },
                { match: false, confidence: 0.1 },
            ],
            [[0, 1], [2]],
        );
        expect(evaluation.tp).toBe(1);
        expect(evaluation.fp).toBe(1);
        expect(evaluation.falsePositiveList.map((item) => item.candidate)).toEqual(["unrelated"]);
        expect(evaluation.candidatePrecision).toBeCloseTo(1 / 3);
        expect(evaluation.truePositiveList[0]?.matchedCandidate).toBe("null crash summary");
    });

    test("counts every golden as a false negative when there are no candidates", () => {
        const evaluation = evaluateReview(goldenCommentList, [], [], null);
        expect(evaluation.fn).toBe(2);
        expect(evaluation.candidatePrecision).toBe(0);
        expect(evaluation.candidateRecall).toBe(0);
    });
});

describe("scoreProfile", () => {
    test("drops an excluded golden from both reward and penalty", () => {
        const evaluation = evaluateReview(
            [
                { comment: "real bug", category: "bug" },
                { comment: "style nit", category: "style" },
            ],
            ["real bug found", "style found"],
            [
                { match: true, confidence: 0.8 },
                { match: false, confidence: 0.1 },
                { match: false, confidence: 0.1 },
                { match: true, confidence: 0.7 },
            ],
            null,
        );
        const strict = scoreProfile([evaluation], new Map(), "strict", 2);
        expect(strict.tp).toBe(1);
        expect(strict.fn).toBe(0);
        expect(strict.fp).toBe(0);
        expect(strict.precision).toBe(1);
        expect(strict.recall).toBe(1);
        expect(strict.f1).toBeCloseTo(fbeta(1, 1, 1));

        const all = scoreProfile([evaluation], new Map(), "all", 2);
        expect(all.tp).toBe(2);
        expect(all.fp).toBe(0);
    });
});

describe("golden comments", () => {
    test("covers every manifest pull request and keeps the published comment count", async () => {
        const golden = await loadGoldenByUrl();
        const manifest = await loadManifest();
        expect(golden.pullRequestCount).toBe(50);
        expect(golden.commentCount).toBe(173);
        for (const entry of manifest.caseList) {
            expect(golden.byUrl.has(entry.sourceUrl)).toBe(true);
        }
    });
});

describe("scoreBatch", () => {
    test("extracts, deduplicates, judges, and writes score.json", async () => {
        const dir = await mkdtemp(join(tmpdir(), "proval-score-"));
        try {
            const runId = "case__1__r1a1__abcd";
            await mkdir(join(dir, "attempt", runId), { recursive: true });
            await writeFile(
                join(dir, "result.jsonl"),
                `${JSON.stringify({
                    type: "result",
                    status: "completed",
                    runId,
                    caseId: "case__1",
                    repeatIndex: 1,
                    attemptIndex: 1,
                })}\n`,
            );
            await writeFile(
                join(dir, "attempt", runId, "review.json"),
                JSON.stringify({
                    posted: [
                        {
                            type: "comment",
                            body: "Summary restates the crash. Additional note that must not be scored.",
                        },
                        {
                            type: "inline",
                            body: "This review mentions a null input crash and a separate cache key problem.",
                        },
                    ],
                }),
            );
            const completer: ChatComplete = async (system, user) => {
                if (system.startsWith("You extract")) {
                    expect(user).not.toContain("must not be scored");
                    return JSON.stringify({ issues: ["null input crash", "cache key problem"] });
                }
                if (system.startsWith("You group")) return JSON.stringify({ groups: [[0], [1]] });
                const match =
                    user.includes("null input crash") &&
                    user.includes("Candidate Issue (from the tool's review):\nnull input crash");
                return JSON.stringify({ reasoning: "checked", match, confidence: match ? 0.9 : 0.2 });
            };
            const document = await scoreBatch({
                batchDir: dir,
                caseById: new Map([["case__1", "https://example.test/pull/1"]]),
                goldenByUrl: new Map([
                    [
                        "https://example.test/pull/1",
                        [{ comment: "null input crash", severity: "High", category: "bug" }],
                    ],
                ]),
                categoryByComment: new Map([["null input crash", "bug"]]),
                completer,
                judgeModel: "test-judge",
                force: false,
                dedup: true,
                beta: 2,
            });
            expect(document.attemptList[0]?.evaluation.tp).toBe(1);
            expect(document.attemptList[0]?.evaluation.fp).toBe(1);
            expect(document.primary.core.precision).toBeCloseTo(0.5);
            expect(document.primary.core.recall).toBe(1);
            expect(
                joinInlineBody([
                    { type: "approve", body: "" },
                    { type: "comment", body: "summary must not be scored" },
                    { type: "inline", body: "kept" },
                    { type: "inline", body: "also kept" },
                ]),
            ).toBe("kept\n\n---\n\nalso kept");
            const saved = JSON.parse(await readFile(join(dir, "score.json"), "utf-8")) as { judgeModel: string };
            expect(saved.judgeModel).toBe("test-judge");
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    });
});
