import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import type { GitDiff, GitPullRequestVersion } from "../src/git-provider/types.js";
import type { PostedAction } from "../mock/provider.js";
import type { PullRequestReviewResult } from "../src/agent/pull-request/index.js";
import type { ReviewConfig } from "./config.js";

export type ReviewResultPayload = {
    config: ReviewConfig;
    version: GitPullRequestVersion;
    diffs: GitDiff[];
    fileCount: number;
    review: PullRequestReviewResult;
    posted: PostedAction[];
    ranAt: string;
};

const RESULT_DIR = resolve(import.meta.dir, "result");

function yamlEscape(value: string): string {
    return JSON.stringify(value);
}

function slugBranch(branch: string): string {
    return branch.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "branch";
}

function fileTimestamp(iso: string): string {
    const d = new Date(iso);
    const y = d.getUTCFullYear();
    const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    const h = String(d.getUTCHours()).padStart(2, "0");
    const mi = String(d.getUTCMinutes()).padStart(2, "0");
    const s = String(d.getUTCSeconds()).padStart(2, "0");
    return `${y}-${mo}-${day}-${h}${mi}${s}`;
}

function diffFlag(diff: GitDiff): string {
    if (diff.deletedFile) return "D";
    if (diff.newFile) return "A";
    if (diff.renamedFile) return "R";
    return "M";
}

function diffLabel(diff: GitDiff): string {
    return diff.renamedFile ? `${diff.oldPath} → ${diff.newPath}` : diff.newPath;
}

function postedKind(posted: PostedAction): string {
    return posted.body.startsWith("## Debug") ? "debug" : posted.type;
}

function buildMarkdown(payload: ReviewResultPayload): string {
    const { config, version, diffs, fileCount, review, posted, ranAt } = payload;
    const lines: string[] = ["---"];
    lines.push(`ranAt: ${yamlEscape(ranAt)}`);
    lines.push(`repoUrl: ${yamlEscape(config.repoUrl)}`);
    lines.push(`baseBranch: ${yamlEscape(config.baseBranch)}`);
    lines.push(`headBranch: ${yamlEscape(config.headBranch)}`);
    lines.push(`baseSha: ${yamlEscape(version.baseSha)}`);
    lines.push(`headSha: ${yamlEscape(version.headSha)}`);
    lines.push(`mergeBase: ${yamlEscape(version.baseSha)}`);
    lines.push(`prTitle: ${yamlEscape(config.prTitle)}`);
    lines.push(`language: ${yamlEscape(config.language)}`);
    lines.push(`inlineReview: ${config.inlineReview}`);
    lines.push(`llmBaseUrl: ${yamlEscape(config.llmBaseUrl)}`);
    lines.push(`llmModel: ${yamlEscape(config.llmModel)}`);
    lines.push(`diffCount: ${diffs.length}`);
    lines.push(`fileCount: ${fileCount}`);
    lines.push(`usage.inputToken: ${review.inputToken}`);
    lines.push(`usage.outputToken: ${review.outputToken}`);
    lines.push(`usage.cachedInputToken: ${review.cachedInputToken}`);
    lines.push(`postedCount: ${posted.length}`);
    lines.push(`reviewUnitCount: ${review.reviewUnitList.length}`);
    lines.push("---");
    lines.push("");
    lines.push("# Local agent review");
    lines.push("");
    lines.push(
        `\`${config.headBranch}\` → \`${config.baseBranch}\` · model \`${config.llmModel}\` · inline \`${config.inlineReview}\``,
    );
    lines.push("");

    lines.push("## Config");
    lines.push("");
    lines.push(`- repo: ${config.repoUrl}`);
    lines.push(`- branches: ${config.headBranch} → ${config.baseBranch}`);
    lines.push(`- title: ${config.prTitle}`);
    lines.push(`- language: ${config.language}`);
    lines.push(`- inlineReview: ${config.inlineReview}`);
    lines.push(`- llm: ${config.llmModel} @ ${config.llmBaseUrl}`);
    lines.push(`- headSha: \`${version.headSha}\``);
    lines.push(`- mergeBase: \`${version.baseSha}\``);
    lines.push("");

    lines.push("## Changed files");
    lines.push("");
    if (diffs.length === 0) {
        lines.push("(none)");
    } else {
        for (const diff of diffs) {
            lines.push(`- \`${diffFlag(diff)}\` ${diffLabel(diff)}`);
        }
    }
    lines.push("");
    lines.push(`Loaded file count for mock archive: ${fileCount}`);
    lines.push("");

    lines.push("## Plan review units");
    lines.push("");
    if (review.reviewUnitList.length === 0) {
        lines.push("(none)");
        lines.push("");
    } else {
        for (const unit of review.reviewUnitList) {
            lines.push(`### Unit ${unit.id}: ${unit.name}`);
            lines.push("");
            lines.push(unit.description);
            lines.push("");
            lines.push("```json");
            lines.push(JSON.stringify({ files: unit.files, references: unit.references ?? [] }, null, 2));
            lines.push("```");
            lines.push("");
        }
    }

    lines.push("## Sub agent outputs");
    lines.push("");
    lines.push("Messages passed to the writing agent.");
    lines.push("");
    if (review.subAgentList.length === 0) {
        lines.push("(none)");
        lines.push("");
    } else {
        for (const sub of review.subAgentList) {
            lines.push(`### Sub ${sub.index}/${sub.total}: ${sub.reviewUnit.name}`);
            lines.push("");
            lines.push(
                `tokens in=${sub.inputToken} out=${sub.outputToken} cached=${sub.cachedInputToken}`,
            );
            lines.push("");
            lines.push(sub.finalMessage.trimEnd() || "(empty)");
            lines.push("");
        }
    }

    lines.push("## Posted comments");
    lines.push("");
    if (posted.length === 0) {
        lines.push("(none)");
        lines.push("");
    } else {
        for (const [index, item] of posted.entries()) {
            lines.push(`### Posted #${index + 1} [${postedKind(item)}]`);
            lines.push("");
            lines.push(item.body.trimEnd() || "(empty)");
            lines.push("");
        }
    }

    lines.push("## Token usage");
    lines.push("");
    lines.push(
        `- total: input=${review.inputToken} output=${review.outputToken} cached=${review.cachedInputToken}`,
    );
    for (const sub of review.subAgentList) {
        lines.push(
            `- sub ${sub.index}/${sub.total} (${sub.reviewUnit.name}): in=${sub.inputToken} out=${sub.outputToken} cached=${sub.cachedInputToken}`,
        );
    }
    lines.push("");

    return lines.join("\n");
}

export async function writeReviewResultMd(payload: ReviewResultPayload): Promise<string> {
    await mkdir(RESULT_DIR, { recursive: true });
    const name = `${fileTimestamp(payload.ranAt)}-${slugBranch(payload.config.headBranch)}.md`;
    const outPath = resolve(RESULT_DIR, name);
    await Bun.write(outPath, buildMarkdown(payload));
    return outPath;
}
