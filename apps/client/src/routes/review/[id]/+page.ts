import fetchApi from "$lib/utils";
import type { ActivityLogResponse, ActivityResponse, ProviderOption } from "@proval/types";
import { loadRepositoryProvider } from "../../repository/[id]/load.js";
import type { PageLoad } from "./$types";

export const load: PageLoad = async ({ params }) => {
    const [reviewResponse, logResponse] = await Promise.all([
        fetchApi(`/activity/${params.id}`),
        fetchApi(`/activity/${params.id}/log`),
    ]);

    const review: ActivityResponse = await reviewResponse.json();
    const log: ActivityLogResponse = logResponse.ok
        ? await logResponse.json()
        : { status: review.status, logVersion: "1", entryList: [] };

    let provider: ProviderOption | null = null;

    // GitHub web URLs need no provider option, so skip the installation lookup that calls the GitHub API
    if (review.repositoryId != null && review.provider !== "github") {
        provider = await loadRepositoryProvider(review.repositoryId);
    }

    return { review, log, provider };
};
