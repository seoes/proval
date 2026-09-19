import type { Activity } from "@proval/types";
import { formatDateOnlyLabel, parseDateOnlyQuery } from "$lib/utils/date.js";

export const REVIEW_LIST_LIMIT = 10;

const ACTIVITY_STATUS_LIST = ["started", "completed", "failed", "canceled"] as const;
const ACTIVITY_TYPE_LIST = ["pr_review", "pr_reply", "issue_open", "issue_reply"] as const;

export type ReviewFilter = {
    page: number;
    statusList: Activity["status"][];
    typeList: Activity["type"][];
    repositoryIdList: number[];
    from: string;
    to: string;
};

function parsePage(value: string | null): number {
    const page = Number(value ?? "1");
    if (!Number.isFinite(page) || page < 1) return 1;
    return Math.floor(page);
}

function parseCommaSeparatedEnum<T extends string>(value: string | null, allowedList: readonly T[]): T[] {
    if (!value?.trim()) return [];
    const allowed = new Set<string>(allowedList);
    const seen = new Set<T>();
    const result: T[] = [];
    for (const part of value.split(",")) {
        const trimmed = part.trim();
        if (!trimmed || !allowed.has(trimmed)) continue;
        const item = trimmed as T;
        if (seen.has(item)) continue;
        seen.add(item);
        result.push(item);
    }
    return result;
}

function parseSingleEnum<T extends string>(value: string | null, allowedList: readonly T[]): T[] {
    const list = parseCommaSeparatedEnum(value, allowedList);
    return list.length ? [list[0]] : [];
}

function parseCommaSeparatedPositiveIntList(value: string | null): number[] {
    if (!value?.trim()) return [];
    const seen = new Set<number>();
    const result: number[] = [];
    for (const part of value.split(",")) {
        const trimmed = part.trim();
        if (!trimmed) continue;
        const parsed = parseInt(trimmed, 10);
        if (!Number.isFinite(parsed) || parsed < 1) continue;
        if (seen.has(parsed)) continue;
        seen.add(parsed);
        result.push(parsed);
    }
    return result;
}

export function formatReviewDateRangeLabel(from: string, to: string): string {
    if (!from && !to) return "All";
    if (from && to && from !== to) {
        return `${formatDateOnlyLabel(from, { month: "short", day: "numeric" })} – ${formatDateOnlyLabel(to, {
            month: "short",
            day: "numeric",
            year: "numeric",
        })}`;
    }
    return formatDateOnlyLabel(from || to);
}

export function parseReviewFilter(url: URL): ReviewFilter {
    return {
        page: parsePage(url.searchParams.get("page")),
        statusList: parseSingleEnum(url.searchParams.get("status"), ACTIVITY_STATUS_LIST),
        typeList: parseSingleEnum(url.searchParams.get("type"), ACTIVITY_TYPE_LIST),
        repositoryIdList: parseCommaSeparatedPositiveIntList(url.searchParams.get("repository")),
        from: parseDateOnlyQuery(url.searchParams.get("from")),
        to: parseDateOnlyQuery(url.searchParams.get("to")),
    };
}

export function hasReviewFilter(filter: ReviewFilter): boolean {
    return (
        filter.statusList.length > 0 ||
        filter.typeList.length > 0 ||
        filter.repositoryIdList.length > 0 ||
        filter.from !== "" ||
        filter.to !== ""
    );
}

export function buildActivityApiQuery(filter: ReviewFilter): string {
    const params = new URLSearchParams();
    params.set("page", String(filter.page));
    params.set("limit", String(REVIEW_LIST_LIMIT));
    if (filter.statusList.length) params.set("status", filter.statusList[0]);
    if (filter.typeList.length) params.set("type", filter.typeList[0]);
    if (filter.repositoryIdList.length) params.set("repository", filter.repositoryIdList.join(","));
    if (filter.from) params.set("from", filter.from);
    if (filter.to) params.set("to", filter.to);
    return params.toString();
}

export function buildReviewSearch(filter: ReviewFilter): string {
    const params = new URLSearchParams();
    if (filter.page > 1) params.set("page", String(filter.page));
    if (filter.statusList.length) params.set("status", filter.statusList[0]);
    if (filter.typeList.length) params.set("type", filter.typeList[0]);
    if (filter.repositoryIdList.length) params.set("repository", filter.repositoryIdList.join(","));
    if (filter.from) params.set("from", filter.from);
    if (filter.to) params.set("to", filter.to);
    const query = params.toString();
    return query ? `?${query}` : "";
}

const REVIEW_LIST_SEARCH_KEY = "proval.reviewListSearch";

export function persistReviewListSearch(filter: ReviewFilter): void {
    if (typeof sessionStorage === "undefined") return;
    sessionStorage.setItem(REVIEW_LIST_SEARCH_KEY, buildReviewSearch(filter));
}

export function readReviewListBackHref(): string {
    if (typeof sessionStorage === "undefined") return "/review";
    const search = sessionStorage.getItem(REVIEW_LIST_SEARCH_KEY);
    if (!search) return "/review";
    return search.startsWith("?") ? `/review${search}` : `/review?${search}`;
}

export function toggleRepositoryId(list: number[], id: number): number[] {
    if (list.includes(id)) {
        return list.filter((item) => item !== id);
    }
    return [...list, id];
}

export const REVIEW_STATUS_OPTION_LIST: { value: Activity["status"]; label: string }[] = [
    { value: "started", label: "In progress" },
    { value: "completed", label: "Completed" },
    { value: "failed", label: "Failed" },
    { value: "canceled", label: "Canceled" },
];

export const REVIEW_TYPE_OPTION_LIST: { value: Activity["type"]; label: string }[] = [
    { value: "pr_review", label: "PR Review" },
    { value: "pr_reply", label: "PR Reply" },
    { value: "issue_open", label: "Issue Open" },
    { value: "issue_reply", label: "Issue Reply" },
];
