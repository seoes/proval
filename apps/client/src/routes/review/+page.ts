import fetchApi from "$lib/utils";
import type { ActivityResponse, Pagination, RepositoryResponse } from "@proval/types";
import type { PageLoad } from "./$types";
import { buildActivityApiQuery, parseReviewFilter } from "./filterQuery.js";

export const load: PageLoad = async ({ url }) => {
    const filter = parseReviewFilter(url);
    const activityQuery = buildActivityApiQuery(filter);

    const [activityResponse, repositoryResponse] = await Promise.all([
        fetchApi(`/activity?${activityQuery}`),
        fetchApi("/repository"),
    ]);
    const result: Pagination<ActivityResponse> = await activityResponse.json();
    const repositoryList: RepositoryResponse[] = repositoryResponse.ok ? await repositoryResponse.json() : [];

    return {
        reviewList: result.itemList,
        page: result.page,
        limit: result.limit,
        total: result.total,
        statusList: filter.statusList,
        typeList: filter.typeList,
        repositoryIdList: filter.repositoryIdList,
        from: filter.from,
        to: filter.to,
        repositoryList,
    };
};
