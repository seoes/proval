import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import type { GitDiff, GitPullRequestVersion } from "../src/git-provider/types.js";
import type { PostedAction } from "../mock/provider.js";
import type { PullRequestReviewResult, PullRequestReviewSubAgentResult } from "../src/agent/pull-request/index.js";
import type { ReviewUnit } from "../src/agent/pull-request/review/plan.schema.js";
import type { ReviewConfig, SaveResultFormat } from "./config.js";

export type ReviewResultPayload = {
    config: ReviewConfig;
    version: GitPullRequestVersion;
    diffs: GitDiff[];
    fileCount: number;
    review: PullRequestReviewResult;
    posted: PostedAction[];
    ranAt: string;
};

type ResultDocument = {
    ranAt: string;
    config: {
        repoUrl: string;
        baseBranch: string;
        headBranch: string;
        prTitle: string;
        prBody: string;
        language: string;
        inlineReview: boolean;
        llmBaseUrl: string;
        llmModel: string;
    };
    version: { headSha: string; baseSha: string; startSha: string };
    fileCount: number;
    changedFileList: Array<{ flag: string; path: string }>;
    review: {
        inputToken: number;
        outputToken: number;
        cachedInputToken: number;
        reviewUnitList: ReviewUnit[];
        subAgentList: PullRequestReviewSubAgentResult[];
    };
    posted: Array<{ type: string; kind: string; body: string }>;
};

const RESULT_DIR = resolve(import.meta.dir, "result");

function buildResultDocument(payload: ReviewResultPayload): ResultDocument {
    const { config, version, diffs, fileCount, review, posted, ranAt } = payload;
    return {
        ranAt,
        config,
        version,
        fileCount,
        changedFileList: diffs.map((diff) => ({
            flag: diff.deletedFile ? "D" : diff.newFile ? "A" : diff.renamedFile ? "R" : "M",
            path: diff.renamedFile ? `${diff.oldPath} → ${diff.newPath}` : diff.newPath,
        })),
        review,
        posted: posted.map((item) => ({
            type: item.type,
            kind: item.body.startsWith("## Debug") ? "debug" : item.type,
            body: item.body,
        })),
    };
}

function renderMarkdown(doc: ResultDocument): string {
    const { config, version, fileCount, review, posted, ranAt } = doc;
    const { headSha, baseSha, startSha } = version;
    const { inputToken, outputToken, cachedInputToken, reviewUnitList } = review;
    const { repoUrl, baseBranch, headBranch, prTitle, language, inlineReview, llmBaseUrl, llmModel } = config;
    const frontMatter: Record<string, string | number | boolean> = {
        ranAt,
        repoUrl,
        baseBranch,
        headBranch,
        startSha,
        baseSha,
        headSha,
        prTitle,
        language,
        inlineReview,
        llmBaseUrl,
        llmModel,
        fileCount,
        postedCount: posted.length,
        reviewUnitCount: reviewUnitList.length,
        inputToken,
        outputToken,
        cachedInputToken,
    };

    const lines: string[] = ["---"];
    for (const [key, value] of Object.entries(frontMatter)) {
        lines.push(`${key}: ${typeof value === "string" ? JSON.stringify(value) : value}`);
    }
    lines.push("---", "");

    lines.push("# Local agent review", "");
    lines.push(
        `\`${doc.config.headBranch}\` → \`${doc.config.baseBranch}\` · model \`${doc.config.llmModel}\` · inline \`${doc.config.inlineReview}\``,
        "",
    );

    lines.push("## Config", "");
    lines.push(`- repo: ${doc.config.repoUrl}`);
    lines.push(`- branches: ${doc.config.headBranch} → ${doc.config.baseBranch}`);
    lines.push(`- title: ${doc.config.prTitle}`);
    lines.push(`- language: ${doc.config.language}`);
    lines.push(`- inlineReview: ${doc.config.inlineReview}`);
    lines.push(`- llm: ${doc.config.llmModel} @ ${doc.config.llmBaseUrl}`);
    lines.push(`- headSha: \`${doc.version.headSha}\``);
    lines.push(`- startSha: \`${doc.version.startSha}\``);
    lines.push(`- baseSha: \`${doc.version.baseSha}\``);
    lines.push("");

    lines.push("## Changed files", "");
    if (doc.changedFileList.length === 0) {
        lines.push("(none)");
    } else {
        for (const file of doc.changedFileList) {
            lines.push(`- \`${file.flag}\` ${file.path}`);
        }
    }
    lines.push("", `Loaded file count for mock archive: ${doc.fileCount}`, "");

    lines.push("## Plan review units", "");
    if (doc.review.reviewUnitList.length === 0) {
        lines.push("(none)", "");
    } else {
        for (const unit of doc.review.reviewUnitList) {
            lines.push(`### Unit ${unit.id}: ${unit.name}`, "");
            lines.push(unit.description, "");
            lines.push("```json");
            lines.push(JSON.stringify({ files: unit.files, references: unit.references ?? [] }, null, 2));
            lines.push("```", "");
        }
    }

    lines.push("## Sub agent outputs", "");
    lines.push("Messages passed to the writing agent.", "");
    if (doc.review.subAgentList.length === 0) {
        lines.push("(none)", "");
    } else {
        for (const sub of doc.review.subAgentList) {
            lines.push(`### Sub ${sub.index}/${sub.total}: ${sub.reviewUnit.name}`, "");
            lines.push(`tokens in=${sub.inputToken} out=${sub.outputToken} cached=${sub.cachedInputToken}`, "");
            lines.push(sub.finalMessage.trimEnd() || "(empty)", "");
        }
    }

    lines.push("## Posted comments", "");
    if (doc.posted.length === 0) {
        lines.push("(none)", "");
    } else {
        for (const [index, item] of doc.posted.entries()) {
            lines.push(`### Posted #${index + 1} [${item.kind}]`, "");
            lines.push(item.body.trimEnd() || "(empty)", "");
        }
    }

    lines.push("## Token usage", "");
    lines.push(
        `- total: input=${doc.review.inputToken} output=${doc.review.outputToken} cached=${doc.review.cachedInputToken}`,
    );
    for (const sub of doc.review.subAgentList) {
        lines.push(
            `- sub ${sub.index}/${sub.total} (${sub.reviewUnit.name}): in=${sub.inputToken} out=${sub.outputToken} cached=${sub.cachedInputToken}`,
        );
    }
    lines.push("");

    return lines.join("\n");
}

export async function writeReviewResult(
    payload: ReviewResultPayload,
    format: Exclude<SaveResultFormat, "none">,
): Promise<string> {
    const doc = buildResultDocument(payload);
    const content = format === "json" ? `${JSON.stringify(doc, null, 2)}\n` : renderMarkdown(doc);

    const d = new Date(payload.ranAt);
    const stamp = [
        d.getUTCFullYear(),
        String(d.getUTCMonth() + 1).padStart(2, "0"),
        String(d.getUTCDate()).padStart(2, "0"),
        "-",
        String(d.getUTCHours()).padStart(2, "0"),
        String(d.getUTCMinutes()).padStart(2, "0"),
        String(d.getUTCSeconds()).padStart(2, "0"),
    ].join("");
    const slug = payload.config.headBranch.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "branch";
    const ext = format === "json" ? "json" : "md";

    await mkdir(RESULT_DIR, { recursive: true });
    const outPath = resolve(RESULT_DIR, `${stamp}-${slug}.${ext}`);
    await Bun.write(outPath, content);
    return outPath;
}
