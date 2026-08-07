import type { PageLoad } from "./$types";

export const load: PageLoad = async ({ url, parent }) => {
    const { auth } = await parent();
    const next = url.searchParams.get("next");
    const nextPath = next && /^\/[^/\\]/.test(next) ? next : "/";
    return { auth, nextPath };
};
