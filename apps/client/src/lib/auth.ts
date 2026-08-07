import type { AuthMeResponse } from "@proval/types";
import fetchApi from "$lib/utils";

export const AUTH_PAGE_PATH_LIST = ["/setup", "/login", "/register"] as const;

export function isAuthPagePath(pathname: string): boolean {
    return (AUTH_PAGE_PATH_LIST as readonly string[]).includes(pathname);
}

export async function fetchAuthMe(): Promise<AuthMeResponse> {
    const response = await fetchApi("/auth/me");
    if (!response.ok) {
        throw new Error(`Failed to load auth state (${response.status})`);
    }
    return response.json();
}
