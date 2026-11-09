import fetchApi from "$lib/utils";
import type { AccessResponse, GitAccessOverviewResponse } from "@proval/types";
import { error } from "@sveltejs/kit";
import type { PageLoad } from "./$types";

export const ssr = false;

export const load: PageLoad = async ({ params }) => {
    const id = parseInt(params.id, 10);
    if (!Number.isFinite(id)) {
        throw error(400, "Invalid access configuration id");
    }

    const [accessRes, overviewRes] = await Promise.all([
        fetchApi(`/access/${id}`),
        fetchApi(`/access/${id}/overview`),
    ]);

    if (!accessRes.ok) {
        throw error(404, "Access configuration not found");
    }

    const access: AccessResponse = await accessRes.json();
    const overview: GitAccessOverviewResponse | null = overviewRes.ok ? await overviewRes.json() : null;

    return {
        access,
        overview,
    };
};

