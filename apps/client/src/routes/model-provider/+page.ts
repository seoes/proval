import fetchApi from "$lib/utils";
import type { ModelProviderResponse } from "@proval/types";
import type { PageLoad } from "./$types";

export const load: PageLoad = async () => {
    const response = await fetchApi("/model-provider");
    const result: ModelProviderResponse[] = await response.json();
    return {
        modelProviderList: result,
    };
};
