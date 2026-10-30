import { redirect } from "@sveltejs/kit";
import type { UserResponse } from "@proval/types";
import fetchApi from "$lib/utils";
import type { PageLoad } from "./$types";

export const load: PageLoad = async ({ parent }) => {
    const { auth } = await parent();
    if (auth.user?.role !== "admin") {
        throw redirect(302, "/");
    }
    const response = await fetchApi("/user");
    if (response.status === 401 || response.status === 403) {
        throw redirect(302, "/");
    }
    if (!response.ok) {
        throw new Error("Failed to load users");
    }
    const userList: UserResponse[] = await response.json();
    return { userList };
};
