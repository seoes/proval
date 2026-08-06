import type { PageLoad } from "./$types";
import fetchApi from "$lib/utils";
import type { InstanceSettingResponse } from "@proval/types";

export const load: PageLoad = async ({ parent }) => {
    const { auth } = await parent();
    const response = await fetchApi("/settings");
    const setting: InstanceSettingResponse = response.ok
        ? await response.json()
        : {
              isAuthEnabled: auth.isAuthEnabled,
              isRegistrationEnabled: auth.isRegistrationEnabled,
          };
    return { auth, setting };
};
