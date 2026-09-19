import {
    accessList,
    buildActivitySummary,
    getAccessById,
    getAccessRepositoryList,
    getActivityById,
    getActivityLogsById,
    getGitHubInstallationById,
    getGitHubRepositoryList,
    getModelListByProviderId,
    getModelProviderById,
    getRepositoryById,
    githubAppList,
    githubInstallationList,
    modelProviderList,
    paginateActivityList,
    repositoryList,
} from "./fixtures.js";
import { parseDateOnlyQuery } from "$lib/utils/date.js";

const JSON_HEADERS = { "Content-Type": "application/json" };

function jsonResponse(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

function readOnlyResponse(): Response {
    return jsonResponse({ error: "Demo is read-only" }, 403);
}

function notFoundResponse(): Response {
    return jsonResponse({ error: "Not found" }, 404);
}

function parsePath(path: string): { pathname: string; searchParams: URLSearchParams } {
    const queryIndex = path.indexOf("?");
    if (queryIndex === -1) {
        return { pathname: path, searchParams: new URLSearchParams() };
    }
    return {
        pathname: path.slice(0, queryIndex),
        searchParams: new URLSearchParams(path.slice(queryIndex + 1)),
    };
}

function parsePositiveInt(value: string | null, fallback: number): number {
    const parsed = Number(value ?? String(fallback));
    if (!Number.isFinite(parsed) || parsed < 1) return fallback;
    return Math.floor(parsed);
}

const ACTIVITY_STATUS_LIST = ["started", "completed", "failed", "canceled"] as const;
const ACTIVITY_TYPE_LIST = ["pr_review", "pr_reply", "issue_open", "issue_reply"] as const;

function parseCommaSeparatedActivityStatus(value: string | null): (typeof ACTIVITY_STATUS_LIST)[number][] {
    if (!value?.trim()) return [];
    const allowed = new Set<string>(ACTIVITY_STATUS_LIST);
    const seen = new Set<(typeof ACTIVITY_STATUS_LIST)[number]>();
    const result: (typeof ACTIVITY_STATUS_LIST)[number][] = [];
    for (const part of value.split(",")) {
        const trimmed = part.trim();
        if (!trimmed || !allowed.has(trimmed)) continue;
        const item = trimmed as (typeof ACTIVITY_STATUS_LIST)[number];
        if (seen.has(item)) continue;
        seen.add(item);
        result.push(item);
    }
    return result;
}

function parseCommaSeparatedActivityType(value: string | null): (typeof ACTIVITY_TYPE_LIST)[number][] {
    if (!value?.trim()) return [];
    const allowed = new Set<string>(ACTIVITY_TYPE_LIST);
    const seen = new Set<(typeof ACTIVITY_TYPE_LIST)[number]>();
    const result: (typeof ACTIVITY_TYPE_LIST)[number][] = [];
    for (const part of value.split(",")) {
        const trimmed = part.trim();
        if (!trimmed || !allowed.has(trimmed)) continue;
        const item = trimmed as (typeof ACTIVITY_TYPE_LIST)[number];
        if (seen.has(item)) continue;
        seen.add(item);
        result.push(item);
    }
    return result;
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

function routeGet(pathname: string, searchParams: URLSearchParams): Response {
    if (pathname === "/model-provider") {
        return jsonResponse(modelProviderList);
    }

    const modelProviderMatch = pathname.match(/^\/model-provider\/(\d+)$/);
    if (modelProviderMatch) {
        const provider = getModelProviderById(Number(modelProviderMatch[1]));
        return provider ? jsonResponse(provider) : notFoundResponse();
    }

    const modelListMatch = pathname.match(/^\/model-provider\/(\d+)\/model$/);
    if (modelListMatch) {
        return jsonResponse(getModelListByProviderId(Number(modelListMatch[1])));
    }

    if (pathname === "/repository") {
        return jsonResponse(repositoryList);
    }

    const repositoryMatch = pathname.match(/^\/repository\/(\d+)$/);
    if (repositoryMatch) {
        const repository = getRepositoryById(Number(repositoryMatch[1]));
        return repository ? jsonResponse(repository) : notFoundResponse();
    }

    if (pathname === "/access") {
        return jsonResponse(accessList);
    }

    const accessMatch = pathname.match(/^\/access\/(\d+)$/);
    if (accessMatch) {
        const access = getAccessById(Number(accessMatch[1]));
        return access ? jsonResponse(access) : notFoundResponse();
    }

    const accessRepoMatch = pathname.match(/^\/access\/(\d+)\/repository$/);
    if (accessRepoMatch) {
        return jsonResponse(getAccessRepositoryList(Number(accessRepoMatch[1])));
    }

    if (pathname === "/github/app") {
        return jsonResponse(githubAppList);
    }

    const installationListMatch = pathname.match(/^\/github\/app\/(\d+)\/installation$/);
    if (installationListMatch) {
        return jsonResponse(githubInstallationList);
    }

    const installationMatch = pathname.match(/^\/github\/app\/(\d+)\/installation\/(\d+)$/);
    if (installationMatch) {
        const installation = getGitHubInstallationById(Number(installationMatch[2]));
        return installation ? jsonResponse(installation) : notFoundResponse();
    }

    const githubRepoMatch = pathname.match(/^\/github\/app\/(\d+)\/installation\/(\d+)\/repository$/);
    if (githubRepoMatch) {
        return jsonResponse(getGitHubRepositoryList());
    }

    if (pathname === "/activity/summary") {
        return jsonResponse(buildActivitySummary(searchParams.get("range")));
    }

    if (pathname === "/activity") {
        const page = parsePositiveInt(searchParams.get("page"), 1);
        const limit = parsePositiveInt(searchParams.get("limit"), 10);
        const statusList = parseCommaSeparatedActivityStatus(searchParams.get("status"));
        const typeList = parseCommaSeparatedActivityType(searchParams.get("type"));
        const repositoryIdList = parseCommaSeparatedPositiveIntList(searchParams.get("repository"));
        const from = parseDateOnlyQuery(searchParams.get("from"));
        const to = parseDateOnlyQuery(searchParams.get("to"));
        return jsonResponse(
            paginateActivityList(page, limit, {
                statusList: statusList.length ? statusList : undefined,
                typeList: typeList.length ? typeList : undefined,
                repositoryIdList: repositoryIdList.length ? repositoryIdList : undefined,
                from: from || undefined,
                to: to || undefined,
            }),
        );
    }

    const activityLogMatch = pathname.match(/^\/activity\/(\d+)\/log$/);
    if (activityLogMatch) {
        const log = getActivityLogsById(Number(activityLogMatch[1]));
        return log ? jsonResponse(log) : notFoundResponse();
    }

    const activityMatch = pathname.match(/^\/activity\/(\d+)$/);
    if (activityMatch) {
        const activity = getActivityById(Number(activityMatch[1]));
        return activity ? jsonResponse(activity) : notFoundResponse();
    }

    return notFoundResponse();
}

export async function demoFetch(path: string, options: RequestInit = {}): Promise<Response> {
    const method = (options.method ?? "GET").toUpperCase();

    if (method !== "GET") {
        return readOnlyResponse();
    }

    const { pathname, searchParams } = parsePath(path);
    return routeGet(pathname, searchParams);
}
