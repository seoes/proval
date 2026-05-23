import fetchApi from "$lib/utils";
import type { RepositoryResponse } from "@code-review/types";
import type { PageLoad } from "./$types";

export const load: PageLoad = async () => {
    const response = await fetchApi("/repository");
    const result: RepositoryResponse[] = await response.json();
    return {
        repositoryList: result,
    };
};
