import {
    accessList,
    activitySummary,
    getAccessById,
    getAccessRepositoryList,
    getActivityById,
    getGitHubInstallationById,
    getGitHubRepositoryList,
    getModelListByProviderId,
    getModelProviderById,
    getRepositoryById,
    githubAppList,
    githubInstallationList,
    modelProviderList,
    paginateActivities,
    repositoryList,
} from "./fixtures.js";

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
        return jsonResponse(activitySummary);
    }

    if (pathname === "/activity") {
        const page = parsePositiveInt(searchParams.get("page"), 1);
        const limit = parsePositiveInt(searchParams.get("limit"), 10);
        return jsonResponse(paginateActivities(page, limit));
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
