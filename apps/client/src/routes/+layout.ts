import { redirect } from "@sveltejs/kit";
import type { LayoutLoad } from "./$types";
import { fetchAuthMe, isAuthPagePath } from "$lib/auth";
import { isDemoMode } from "$lib/demo/enabled";

export const ssr = false;
export const prerender = false;

export const load: LayoutLoad = async ({ url }) => {
    if (isDemoMode()) {
        return {
            auth: {
                user: null,
                isAuthEnabled: false,
                isRegistrationEnabled: false,
                isSetupRequired: false,
            },
        };
    }

    const auth = await fetchAuthMe();
    const pathname = url.pathname;

    if (auth.isSetupRequired) {
        if (pathname !== "/setup") {
            throw redirect(302, "/setup");
        }
        return { auth };
    }

    if (pathname === "/setup") {
        throw redirect(302, "/");
    }

    if (auth.isAuthEnabled && !auth.user && !isAuthPagePath(pathname)) {
        throw redirect(302, "/login");
    }

    if (auth.user && (pathname === "/login" || pathname === "/register")) {
        throw redirect(302, "/");
    }

    if (pathname === "/register" && !auth.isRegistrationEnabled) {
        throw redirect(302, auth.user ? "/" : "/login");
    }

    return { auth };
};
