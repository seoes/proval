import fetchApi from "$lib/utils";
import type { ActivitySummaryResponse, RepositoryResponse } from "@proval/types";
import { error } from "@sveltejs/kit";
import type { PageLoad } from "./$types";
import { resolveProviderForRepository } from "./load.js";

export const ssr = false;

const emptyActivitySummary: ActivitySummaryResponse = {
    range: "24h",
    stats: { totalActivity: 0, errors: 0, reviews: 0, replies: 0 },
    recent: [],
    tokenSeries: [],
    tokensByModel: [],
    tokensByRepository: [],
    inProgress: [],
};

export const load: PageLoad = async ({ params }) => {
    const repositoryId = Number(params.id);
    const [repositoryResponse, activitySummaryResponse] = await Promise.all([
        fetchApi(`/repository/${params.id}`),
        fetchApi(`/activity/summary?range=24h&repository=${params.id}`),
    ]);

    if (!repositoryResponse.ok) {
        throw error(404, "Repository not found");
    }
    const repository: RepositoryResponse = await repositoryResponse.json();

    // GitHub web URLs need no provider option, so skip the installation lookup that calls the GitHub API
    const provider = repository.provider === "github" ? null : await resolveProviderForRepository(repository);
    if (repository.provider !== "github" && !provider) {
        throw error(400, "Git provider access is missing");
    }

    const activitySummary: ActivitySummaryResponse = activitySummaryResponse.ok
        ? await activitySummaryResponse.json()
        : emptyActivitySummary;

    return {
        repository,
        provider,
        repositoryId,
        activitySummary,
    };
};
