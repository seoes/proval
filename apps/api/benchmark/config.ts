import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import os from "node:os";
import { git } from "./load/git.js";
import type { BenchmarkLlmConfig, BenchmarkProfile, SourceState } from "./types.js";

export const REPO_ROOT = resolve(import.meta.dir, "..", "..", "..");
export const PROFILE_PATH = resolve(process.env.BENCHMARK_PROFILE_PATH ?? join(import.meta.dir, "profile.json"));
export const PROFILE_SCHEMA_VERSION = 1;

/** Fill missing process env entries from a dotenv style file. Never overrides. */
export async function loadDotEnvFile(path: string): Promise<void> {
    if (!existsSync(path)) return;
    const content = await readFile(path, "utf-8");
    for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eq = trimmed.indexOf("=");
        if (eq <= 0) continue;
        const key = trimmed.slice(0, eq).trim();
        let value = trimmed.slice(eq + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        if (process.env[key] === undefined) {
            process.env[key] = value;
        }
    }
}

export function loadBenchmarkLlmConfig(): BenchmarkLlmConfig {
    const missingList = ["LLM_BASE_URL", "LLM_API_KEY", "LLM_MODEL"].filter((key) => !process.env[key]?.trim());
    if (missingList.length > 0) {
        throw new Error(`Missing required env: ${missingList.join(", ")} (see .env.benchmark.example)`);
    }
    const provider = process.env.LLM_PROVIDER?.trim() || "openai";
    if (provider !== "openai" && provider !== "openai_responses" && provider !== "anthropic") {
        throw new Error("LLM_PROVIDER must be openai, openai_responses or anthropic");
    }
    return {
        provider: provider,
        baseURL: process.env.LLM_BASE_URL!.trim(),
        apiKey: process.env.LLM_API_KEY!.trim(),
        model: process.env.LLM_MODEL!.trim(),
    };
}

export async function loadProfile(path: string = PROFILE_PATH): Promise<BenchmarkProfile> {
    const profile = JSON.parse(await readFile(path, "utf-8")) as BenchmarkProfile;
    if (profile.schemaVersion !== PROFILE_SCHEMA_VERSION) {
        throw new Error(`Unsupported profile schemaVersion ${profile.schemaVersion}`);
    }
    if (!profile.quick || !profile.full) {
        throw new Error("profile must define quick and full run profiles");
    }
    return profile;
}

export async function hashFileContent(path: string): Promise<string> {
    return createHash("sha256")
        .update(await readFile(path))
        .digest("hex");
}

/** Strip any userinfo so a credential bearing URL is never persisted. */
export function safeUrl(rawUrl: string): string {
    try {
        const url = new URL(rawUrl);
        url.username = "";
        url.password = "";
        return url.toString();
    } catch {
        return "(unparseable url)";
    }
}

export async function collectSourceState(repoRoot: string = REPO_ROOT): Promise<SourceState> {
    const provalCommit = await git(["rev-parse", "HEAD"], repoRoot);
    const status = await git(["status", "--porcelain"], repoRoot);
    const isDirty = status.trim().length > 0;
    const hash = createHash("sha256").update(provalCommit).update("\n").update(status);
    if (isDirty) {
        hash.update("\n").update(await git(["diff", "HEAD"], repoRoot));
        const untrackedPathList = (await git(["ls-files", "--others", "--exclude-standard", "-z"], repoRoot))
            .split("\0")
            .filter(Boolean)
            .sort();
        for (const path of untrackedPathList) {
            hash.update("\0")
                .update(path)
                .update("\0")
                .update(await hashFileContent(join(repoRoot, path)));
        }
    }
    return { provalCommit, isDirty, sourceStateHash: hash.digest("hex") };
}

export function machineDescription(): string {
    const cpu = os.cpus()[0];
    const memoryGb = Math.round(os.totalmem() / 1024 ** 3);
    return `${os.platform()}/${os.arch()} ${cpu?.model ?? "unknown cpu"} x${os.cpus().length} ${memoryGb}GB`;
}
