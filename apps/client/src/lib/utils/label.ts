import type { BadgeVariant } from "$lib/components/atom/Badge.svelte";
import type { Activity, ModelProvider, ReplyThreadPolicy, RepositoryProvider } from "@proval/types";

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

const activityTypeLabelList: Record<Activity["type"], string> = {
    pr_review: "PR Review",
    pr_reply: "PR Reply",
    issue_open: "Issue Open",
    issue_reply: "Issue Reply",
};

export function activityTypeLabel(type: Activity["type"]): string {
    return activityTypeLabelList[type] ?? type;
}

export function activityStatusBadge(status: Activity["status"]): OptionBadge {
    if (status === "completed") return { variant: "success", label: "Completed" };
    if (status === "failed") return { variant: "danger", label: "Failed" };
    return { variant: "primary", label: "Started" };
}

export function activityTargetLabel(type: Activity["type"], targetIid: number): string {
    if (type === "pr_review" || type === "pr_reply") return `!${targetIid}`;
    return `#${targetIid}`;
}

export function truncateUrl(url: string, max = 40): string {
    if (url.length <= max) return url;
    return `${url.slice(0, max)}…`;
}
