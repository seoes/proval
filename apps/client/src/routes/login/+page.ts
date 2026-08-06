import type { PageLoad } from "./$types";

export const load: PageLoad = async ({ url, parent }) => {
    const { auth } = await parent();
    const next = url.searchParams.get("next");
    const nextPath = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
    return { auth, nextPath };
};
