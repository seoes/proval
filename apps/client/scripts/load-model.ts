#!/usr/bin/env bun
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const catalogUrl = "https://models.dev/api.json";
const outPath = resolve(import.meta.dir, "../src/lib/data/models.json");
const providerRank: Record<string, number> = { openai: 0, anthropic: 1, xai: 2 };

type CatalogModel = {
    id?: string;
    name?: string;
    cost?: { input?: number; output?: number; cache_read?: number };
    limit?: { context?: number; output?: number; input?: number };
    reasoning_options?: { type?: string; values?: unknown }[];
};

type ModelRow = {
    id: string;
    name: string;
    cost: { input: number; output: number; cachedInput?: number };
    limit: { context: number; output: number; input?: number };
    reasoningEffort?: string[];
};

const response = await fetch(catalogUrl);
if (!response.ok) {
    throw new Error(`Failed to fetch ${catalogUrl}: ${response.status}`);
}

const catalog = (await response.json()) as Record<string, { models?: Record<string, CatalogModel> }>;
if (!catalog || typeof catalog !== "object" || Array.isArray(catalog)) {
    throw new Error("models.dev api.json must be a provider object");
}

const chosen = new Map<string, { rank: number; hasCachedInput: boolean; row: ModelRow }>();

for (const [providerId, provider] of Object.entries(catalog)) {
    if (!provider?.models || typeof provider.models !== "object") {
        continue;
    }
    const rank = providerRank[providerId] ?? 3;
    for (const model of Object.values(provider.models)) {
        const id = model.id;
        const name = model.name;
        const input = model.cost?.input;
        const output = model.cost?.output;
        const context = model.limit?.context;
        const outputLimit = model.limit?.output;
        if (
            typeof id !== "string" ||
            !id ||
            typeof name !== "string" ||
            !name ||
            typeof input !== "number" ||
            typeof output !== "number" ||
            typeof context !== "number" ||
            typeof outputLimit !== "number"
        ) {
            continue;
        }

        const row: ModelRow = {
            id,
            name,
            cost: { input, output },
            limit: { context, output: outputLimit },
        };
        if (typeof model.cost?.cache_read === "number") {
            row.cost.cachedInput = model.cost.cache_read;
        }
        if (typeof model.limit?.input === "number") {
            row.limit.input = model.limit.input;
        }
        const effort = model.reasoning_options?.find((option) => option.type === "effort")?.values;
        if (Array.isArray(effort) && effort.length > 0 && effort.every((value) => typeof value === "string")) {
            row.reasoningEffort = effort;
        }

        const hasCachedInput = row.cost.cachedInput != null;
        const current = chosen.get(id);
        if (!current || rank < current.rank || (rank === current.rank && hasCachedInput && !current.hasCachedInput)) {
            chosen.set(id, { rank, hasCachedInput, row });
        }
    }
}

const modelList = [...chosen.values()].map((entry) => entry.row).sort((a, b) => a.id.localeCompare(b.id));
if (modelList.length === 0) {
    throw new Error("No priced models found in models.dev catalog");
}

const idSet = new Set<string>();
for (const row of modelList) {
    if (idSet.has(row.id)) {
        throw new Error(`Duplicate model id ${row.id}`);
    }
    idSet.add(row.id);
}

mkdirSync(dirname(outPath), { recursive: true });
await Bun.write(outPath, `${JSON.stringify(modelList, null, 4)}\n`);
console.log(`ok ${outPath} (${modelList.length} models)`);
