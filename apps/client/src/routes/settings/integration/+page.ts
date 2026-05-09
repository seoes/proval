import type { PageLoad } from './$types';
import fetchApi from '$lib/utils';

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
    accountType: 'User' | 'Organization';
};

export const load: PageLoad = async () => {
    const appRes = await fetchApi('/github/app');
    const appList: GitHubApp[] = appRes.ok ? await appRes.json() : [];

    if (appList.length === 0) {
        return {
            app: null,
            installationList: []
        };
    }

    const app = appList[0];
    const installationRes = await fetchApi(`/github/app/${app.id}/installation`);
    const installationList: GitHubInstallation[] = installationRes.ok
        ? await installationRes.json()
        : [];

    return {
        app,
        installationList
    };
};
