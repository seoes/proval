import fetchApi from "$lib/utils";
import type {
    GitHubAppResponse,
    GitHubRepositoryResponse,
    GitProviderRepositoryListResponse,
    RepositorySelectItem,
} from "@proval/types";

export async function loadGitHubInstallationRepositoryList(installationId: number): Promise<RepositorySelectItem[]> {
    const appResponse = await fetchApi("/github/app");
    if (!appResponse.ok) {
        return [];
    }
    const appList: GitHubAppResponse[] = await appResponse.json();
    const app = appList.length > 0 ? appList[0] : null;
    if (!app) {
        return [];
    }
    const appId = app.id;

    const response = await fetchApi(`/github/app/${appId}/installation/${installationId}/repository`);
    if (!response.ok) {
        return [];
    }
    const repositoryList: GitHubRepositoryResponse[] = await response.json();
    return repositoryList.map((repo) => ({
        id: repo.id,
        path: repo.fullName,
        isConnected: repo.alreadyConnected,
    }));
}

export async function loadGitAccessRepositoryList(accessId: number): Promise<RepositorySelectItem[]> {
    const response = await fetchApi(`/access/${accessId}/repository`);
    if (!response.ok) {
        return [];
    }
    const repositoryList: GitProviderRepositoryListResponse[] = await response.json();
    return repositoryList.map((repo) => ({
        id: repo.id,
        path: repo.fullName,
        isConnected: repo.alreadyConnected,
    }));
}
