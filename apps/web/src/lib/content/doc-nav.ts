import type { DocMeta } from "./types";

export const QUICK_START_SLUGS = ["quick-start"] as const;
export const GIT_PROVIDER_SLUGS = ["gitlab", "forgejo", "github"] as const;
export const LLM_SLUGS = ["set-llm", "llama-cpp", "openrouter"] as const;

export function pickDocsInOrder<T extends { slug: string }>(docs: T[], slugs: readonly string[]): T[] {
    const bySlug = new Map(docs.map((doc) => [doc.slug, doc]));
    return slugs.map((slug) => bySlug.get(slug)).filter((doc): doc is T => doc !== undefined);
}

export function groupDocNav(docs: DocMeta[]) {
    return {
        quickStartDocs: pickDocsInOrder(docs, QUICK_START_SLUGS),
        gitProviderDocs: pickDocsInOrder(docs, GIT_PROVIDER_SLUGS),
        llmDocs: pickDocsInOrder(docs, LLM_SLUGS),
    };
}
