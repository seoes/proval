import type { PageLoad } from "./$types";
import fetchApi from "$lib/utils";
import type { AccessResponse, GitHubAppResponse, GitHubInstallationResponse } from "@proval/types";

export const load: PageLoad = async () => {
    const [appRes, accessRes] = await Promise.all([fetchApi("/github/app"), fetchApi("/access")]);

    const appList: GitHubAppResponse[] = appRes.ok ? await appRes.json() : [];
    const accessList: AccessResponse[] = accessRes.ok ? await accessRes.json() : [];

    if (appList.length === 0) {
        return {
            app: null,
            installationList: [],
            accessList,
        };
    }

    const app = appList[0];
    const installationRes = await fetchApi(`/github/app/${app.id}/installation`);
    const installationList: GitHubInstallationResponse[] = installationRes.ok ? await installationRes.json() : [];

    return {
        app,
        installationList,
        accessList,
    };
};
