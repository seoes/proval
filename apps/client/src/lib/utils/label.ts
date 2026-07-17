import type { BadgeVariant } from "$lib/components/atom/Badge.svelte";
import type { ActivityResponse, LlmApiProvider, CommentReplyPolicy, RepositoryProvider } from "@proval/types";

export type OptionBadge = { variant: BadgeVariant; label: string };

export function replyOptionBadge(label: string, mode: CommentReplyPolicy): OptionBadge | null {
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

const modelProviderLabelList: Record<LlmApiProvider, string> = {
    openai: "OpenAI",
    anthropic: "Anthropic",
};

export function modelProviderLabel(provider: LlmApiProvider | string): string {
    return modelProviderLabelList[provider as LlmApiProvider] ?? provider;
}

const activityTypeLabelList: Record<ActivityResponse["type"], string> = {
    pr_review: "PR Review",
    pr_reply: "PR Reply",
    issue_open: "Issue Open",
    issue_reply: "Issue Reply",
};

export function activityTypeLabel(type: ActivityResponse["type"]): string {
    return activityTypeLabelList[type] ?? type;
}

export function activityStatusBadge(status: ActivityResponse["status"]): OptionBadge {
    if (status === "completed") return { variant: "success", label: "Completed" };
    if (status === "failed") return { variant: "danger", label: "Failed" };
    return { variant: "primary", label: "Started" };
}

export function activityTargetLabel(type: ActivityResponse["type"], targetIid: number): string {
    if (type === "pr_review" || type === "pr_reply") return `!${targetIid}`;
    return `#${targetIid}`;
}

export function truncateUrl(url: string, max = 40): string {
    if (url.length <= max) return url;
    return `${url.slice(0, max)}…`;
}
