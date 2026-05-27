import type { BadgeVariant } from "$lib/components/atom/Badge.svelte";
import type { ModelProvider, ReplyThreadPolicy, RepositoryProvider } from "@proval/types";

export type OptionBadge = { variant: BadgeVariant; label: string };

export function replyOptionBadge(label: string, mode: ReplyThreadPolicy): OptionBadge | null {
    if (mode === "off") return null;
    const suffix = mode === "mentioned_only" ? " (Mentioned Only)" : "";
    return {
        variant: mode === "all" ? "success" : "warning",
        label: `${label}${suffix}`,
    };
}

const providerLabelList: Record<RepositoryProvider, string> = {
    gitlab: "GitLab",
    github: "GitHub",
    forgejo: "Forgejo",
};

export function providerLabel(provider: RepositoryProvider): string {
    return providerLabelList[provider] ?? provider;
}

const modelProviderLabelList: Record<ModelProvider, string> = {
    openai: "OpenAI",
};

export function modelProviderLabel(provider: ModelProvider | string): string {
    return modelProviderLabelList[provider as ModelProvider] ?? provider;
}

export function truncateUrl(url: string, max = 40): string {
    if (url.length <= max) return url;
    return `${url.slice(0, max)}…`;
}
