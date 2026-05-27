import type { BadgeVariant } from "$lib/components/atom/Badge.svelte";

type ReplyPolicy = "all" | "mentioned_only" | "off";
type GitProvider = "gitlab" | "github" | "forgejo";

export type OptionBadge = { variant: BadgeVariant; label: string };

export function replyOptionBadge(label: string, mode: ReplyPolicy): OptionBadge | null {
    if (mode === "off") return null;
    const suffix = mode === "mentioned_only" ? " (Mentioned Only)" : "";
    return {
        variant: mode === "all" ? "success" : "warning",
        label: `${label}${suffix}`,
    };
}

const providerLabelList: Record<GitProvider, string> = {
    gitlab: "GitLab",
    github: "GitHub",
    forgejo: "Forgejo",
};

export function providerLabel(provider: GitProvider): string {
    return providerLabelList[provider] ?? provider;
}

type ModelProvider = "openai";

const modelProviderLabelList: Record<ModelProvider, string> = {
    openai: "OpenAI",
};

export function modelProviderLabel(provider: string): string {
    return modelProviderLabelList[provider as ModelProvider] ?? provider;
}

export function truncateUrl(url: string, max = 40): string {
    if (url.length <= max) return url;
    return `${url.slice(0, max)}…`;
}
