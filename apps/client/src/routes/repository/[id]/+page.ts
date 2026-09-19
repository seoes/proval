import fetchApi from "$lib/utils";
import type { ActivitySummaryResponse, DashboardRange } from "@proval/types";
import type { PageLoad } from "./$types";
import { loadRepositoryPage } from "./load.js";

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
    const [pageData, activitySummaryResponse] = await Promise.all([
        loadRepositoryPage(params.id),
        fetchApi(`/activity/summary?range=24h&repository=${params.id}`),
    ]);

    const activitySummary: ActivitySummaryResponse = activitySummaryResponse.ok
        ? await activitySummaryResponse.json()
        : emptyActivitySummary;

    return {
        ...pageData,
        repositoryId,
        activitySummary,
    };
};
