import fetchApi from "$lib/utils";
import type { ModelResponse } from "@proval/types";
import type { PageLoad } from "./$types";

export const load: PageLoad = async ({ params }) => {
    const response = await fetchApi(`/model/${params.id}`);
    const model: ModelResponse = await response.json();

    return {
        model,
    };
};
