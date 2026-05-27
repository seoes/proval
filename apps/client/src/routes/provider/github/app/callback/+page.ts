import { redirect } from "@sveltejs/kit";
import type { PageLoad } from "./$types";
import fetchApi from "$lib/utils";

export const ssr = false;

export const load: PageLoad = async ({ url }) => {
    const code = url.searchParams.get("code");

    if (!code) {
        redirect(303, "/provider?error=missing_code");
    }

    const response = await fetchApi("/github/app/callback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
    });

    if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        redirect(303, `/provider?error=${encodeURIComponent(data.error || "app_creation_failed")}`);
    }

    const data = (await response.json()) as { slug: string };
    if (!data.slug) {
        redirect(303, "/provider?error=missing_slug");
    }

    redirect(303, "/provider");
};
