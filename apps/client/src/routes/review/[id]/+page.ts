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
    const log: ActivityLogResponse = logResponse.ok ? await logResponse.json() : { status: review.status, logs: [] };

    let provider: ProviderOption | null = null;
    if (review.repositoryId != null) {
        provider = await loadRepositoryProvider(review.repositoryId);
    }

    return { review, log, provider };
};
