import type { PageLoad } from "./$types";
import fetchApi from "$lib/utils";

type GitHubApp = {
    id: number;
    appId: number;
    slug: string;
    createdAt: string;
    updatedAt: string;
};

type GitHubInstallation = {
    id: number;
    installationId: number;
    accountName: string;
    accountType: "User" | "Organization";
};

type AccessItem = {
    id: number;
    provider: "gitlab" | "forgejo";
    name: string;
    baseUrl: string;
    createdAt: string;
    updatedAt: string;
};

export const load: PageLoad = async () => {
    const [appRes, accessRes] = await Promise.all([fetchApi("/github/app"), fetchApi("/access")]);

    const appList: GitHubApp[] = appRes.ok ? await appRes.json() : [];
    const accessList: AccessItem[] = accessRes.ok ? await accessRes.json() : [];

    if (appList.length === 0) {
        return {
            app: null,
            installationList: [],
            accessList,
        };
    }

    const app = appList[0];
    const installationRes = await fetchApi(`/github/app/${app.id}/installation`);
    const installationList: GitHubInstallation[] = installationRes.ok ? await installationRes.json() : [];

    return {
        app,
        installationList,
        accessList,
    };
};
