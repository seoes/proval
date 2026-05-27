import fetchApi from "$lib/utils";
import type {
    AccessResponse,
    GitHubAppResponse,
    GitHubInstallationResponse,
    ModelResponse,
    RepositoryResponse,
} from "@proval/types";
import type { PageLoad } from "./$types";

export const load: PageLoad = async () => {
    const [modelResponse, repositoryResponse, accessResponse, githubAppResponse] = await Promise.all([
        fetchApi("/model"),
        fetchApi("/repository"),
        fetchApi("/access"),
        fetchApi("/github/app"),
    ]);

    const modelList: ModelResponse[] = modelResponse.ok ? await modelResponse.json() : [];
    const repositoryList: RepositoryResponse[] = repositoryResponse.ok ? await repositoryResponse.json() : [];
    const accessList: AccessResponse[] = accessResponse.ok ? await accessResponse.json() : [];
    const githubAppList: GitHubAppResponse[] = githubAppResponse.ok ? await githubAppResponse.json() : [];

    let installationList: GitHubInstallationResponse[] = [];
    if (githubAppList.length > 0) {
        const installationResponse = await fetchApi(`/github/app/${githubAppList[0].id}/installation`);
        installationList = installationResponse.ok ? await installationResponse.json() : [];
    }

    return {
        modelList,
        repositoryList,
        accessList,
        installationList,
    };
};
