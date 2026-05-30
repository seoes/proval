import fetchApi from "$lib/utils";
import type { Activity } from "@proval/types";
import type { PageLoad } from "./$types";

export const load: PageLoad = async ({ params }) => {
    const response = await fetchApi(`/activity/${params.id}`);
    const review: Activity = await response.json();

    return { review };
};
