import type { PageLoad } from "./$types";
import fetchApi from "$lib/utils";
import type { ApiTokenResponse, InstanceSettingResponse } from "@proval/types";

export const load: PageLoad = async ({ parent }) => {
    const { auth } = await parent();
    const response = await fetchApi("/settings");
    const setting: InstanceSettingResponse = response.ok
        ? await response.json()
        : {
              isAuthEnabled: auth.isAuthEnabled,
              isRegistrationEnabled: auth.isRegistrationEnabled,
          };

    // Token management needs a session, so an anonymous or token authenticated
    // visitor simply gets an empty list rather than an error.
    let tokenList: ApiTokenResponse[] = [];
    if (auth.user) {
        const tokenResponse = await fetchApi("/api-token");
        if (tokenResponse.ok) {
            tokenList = await tokenResponse.json();
        }
    }

    return { auth, setting, tokenList };
};
