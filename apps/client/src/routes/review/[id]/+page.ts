import fetchApi from "$lib/utils";
import type { ActivityResponse, ProviderOption } from "@proval/types";
import { loadRepositoryProvider } from "../../repository/[id]/load.js";
import type { PageLoad } from "./$types";

export const load: PageLoad = async ({ params }) => {
    const reviewResponse = await fetchApi(`/activity/${params.id}`);
    const review: ActivityResponse = await reviewResponse.json();

    let provider: ProviderOption | null = null;
    // GitHub web URLs need no provider option, so skip the installation lookup that calls the GitHub API
    if (review.repositoryId != null && review.provider !== "github") {
        provider = await loadRepositoryProvider(review.repositoryId);
    }

    return { review, provider };
};
