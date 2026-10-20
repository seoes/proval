/**
 * Proval agent benchmark runner.
 *
 * Usage:
 *   bun run benchmark run <quick|full> [--batch <id>] [--resume]
 *   bun run benchmark report <batchId>
 *   bun run benchmark compare <baselineBatchId> <candidateBatchId>
 *   bun run benchmark ready
 *   bun run benchmark list
 */
import { resolve } from "node:path";
import { loadDotEnvFile, loadBenchmarkLlmConfig, loadProfile, REPO_ROOT } from "./config.js";
import { loadManifest } from "./load/manifest.js";
import { runBatch } from "./run/run.js";
import { compareBatchById, reportBatch } from "./report/report.js";

const command = process.argv[2];
const argList = process.argv.slice(3);

function optionValue(name: string): string | undefined {
    const index = argList.indexOf(`--${name}`);
    return index >= 0 ? argList[index + 1] : undefined;
}

async function main(): Promise<void> {
    // Model credentials stay in environment configuration and are never
    // persisted. Benchmark runs use the dedicated .env.benchmark file.
    await loadDotEnvFile(resolve(REPO_ROOT, ".env.benchmark"));

    switch (command) {
        case "run": {
            const profileName = argList[0];
            if (profileName !== "quick" && profileName !== "full") {
                throw new Error("usage: benchmark run <quick|full> [--batch <id>] [--resume]");
            }
            await runBatch({
                profileName,
                batchId: optionValue("batch"),
                resume: argList.includes("--resume"),
                caseIdList: optionValue("case")?.split(",").filter(Boolean),
            });
            break;
        }
        case "report": {
            const batchId = argList[0];
            if (!batchId) throw new Error("usage: benchmark report <batchId>");
            console.log(await reportBatch(batchId));
            break;
        }
        case "compare": {
            const [baselineId, candidateId] = argList;
            if (!baselineId || !candidateId) {
                throw new Error("usage: benchmark compare <baselineBatchId> <candidateBatchId>");
            }
            console.log(await compareBatchById(baselineId, candidateId));
            break;
        }
        case "ready": {
            const llm = loadBenchmarkLlmConfig();
            const profile = await loadProfile();
            const { createSender } = await import("../src/agent/llm/factory.js");
            const sender = createSender({
                provider: llm.provider,
                apiKey: llm.apiKey,
                baseURL: llm.baseURL,
                model: llm.model,
                timeoutSecond: profile.setting.timeoutSecond,
                concurrency: profile.setting.llmConcurrency,
            });
            const startedAt = performance.now();
            const response = await sender.send([{ role: "user", content: "Reply with the single word: ready" }], []);
            console.log(
                `warm request done in ${Math.round(performance.now() - startedAt)}ms, ` +
                    `input=${response.usage.inputToken} output=${response.usage.outputToken} cached=${response.usage.cachedInputToken}`,
            );
            break;
        }
        case "list": {
            const manifest = await loadManifest();
            for (const entry of manifest.caseList) {
                const total = entry.addedLineCount + entry.deletedLineCount;
                console.log(
                    `${entry.caseId}  +${entry.addedLineCount} -${entry.deletedLineCount} (${total} lines, ${entry.changedFileCount} files)  ${entry.title}`,
                );
            }
            if (manifest.unavailableList.length > 0) {
                console.log("\nunavailable:");
                for (const item of manifest.unavailableList) {
                    console.log(`${item.sourceUrl}  ${item.reason}`);
                }
            }
            break;
        }
        default:
            console.log(
                [
                    "usage:",
                    "  benchmark run <quick|full> [--batch <id>] [--resume] [--case <id,id...>]",
                    "  benchmark report <batchId>",
                    "  benchmark compare <baselineBatchId> <candidateBatchId>",
                    "  benchmark ready",
                    "  benchmark list",
                ].join("\n"),
            );
            process.exitCode = command ? 1 : 0;
    }
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
});
