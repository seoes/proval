import fetchApi from "$lib/utils";
import type { ActivityResponse, Pagination } from "@proval/types";
import type { PageLoad } from "./$types";

const REVIEW_LIST_LIMIT = 10;

function parsePage(value: string | null): number {
    const page = Number(value ?? "1");
    if (!Number.isFinite(page) || page < 1) return 1;
    return Math.floor(page);
}

export const load: PageLoad = async ({ url }) => {
    const page = parsePage(url.searchParams.get("page"));
    const response = await fetchApi(`/activity?page=${page}&limit=${REVIEW_LIST_LIMIT}`);
    const result: Pagination<ActivityResponse> = await response.json();

    return {
        reviewList: result.itemList,
        page: result.page,
        limit: result.limit,
        total: result.total,
    };
};
