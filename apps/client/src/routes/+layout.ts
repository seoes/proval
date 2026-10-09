import { redirect } from "@sveltejs/kit";
import type { LayoutLoad } from "./$types";
import { fetchAuthMe, isAuthPagePath } from "$lib/auth";
import { isDemoMode } from "$lib/demo/enabled";
import { USER_PROMPT_MAX_LENGTH } from "@proval/types";

export const ssr = false;
export const prerender = false;

export const load: LayoutLoad = async ({ url }) => {
    const pathname = url.pathname;

    if (isDemoMode()) {
        if (isAuthPagePath(pathname)) {
            throw redirect(302, "/");
        }
        return {
            auth: {
                user: null,
                isAuthEnabled: false,
                isRegistrationEnabled: false,
                isSetupRequired: false,
                userPromptMaxLength: USER_PROMPT_MAX_LENGTH,
            },
        };
    }

    const auth = await fetchAuthMe();

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
