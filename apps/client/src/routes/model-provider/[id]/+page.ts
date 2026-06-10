import fetchApi from "$lib/utils";
import type { ModelProviderResponse } from "@proval/types";
import type { PageLoad } from "./$types";

export const load: PageLoad = async ({ params }) => {
    const response = await fetchApi(`/model-provider/${params.id}`);
    const modelProvider: ModelProviderResponse = await response.json();

    return {
        modelProvider,
    };
};
