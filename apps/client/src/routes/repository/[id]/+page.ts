import fetchApi from "$lib/utils";
import type {
    AccessResponse,
    GitHubAppResponse,
    GitHubInstallationResponse,
    ModelResponse,
    RepositoryResponse,
} from "@proval/types";
import type { PageLoad } from "./$types";
import { error } from "@sveltejs/kit";

export const load: PageLoad = async ({ params }) => {
    const [repositoryResponse, modelListResponse, accessResponse] = await Promise.all([
        fetchApi(`/repository/${params.id}`),
        fetchApi("/model"),
        fetchApi("/access"),
    ]);

    if (!repositoryResponse.ok) {
        throw error(404, "Repository not found");
    }

    const repository: RepositoryResponse = await repositoryResponse.json();
    const modelList: ModelResponse[] = await modelListResponse.json();
    const accessList: AccessResponse[] = accessResponse.ok
        ? (await accessResponse.json()).filter((access: AccessResponse) => access.provider === repository.provider)
        : [];

    let installationList: GitHubInstallationResponse[] = [];
    let githubApp: GitHubAppResponse | null = null;
    if (repository.provider === "github") {
        const appRes = await fetchApi("/github/app");
        const appList: GitHubAppResponse[] = appRes.ok ? await appRes.json() : [];
        githubApp = appList.length > 0 ? appList[0] : null;
        if (githubApp) {
            const installationRes = await fetchApi(`/github/app/${githubApp.id}/installation`);
            installationList = installationRes.ok ? await installationRes.json() : [];
        }
    }

    return {
        repository,
        modelList,
        accessList,
        installationList,
        githubApp,
    };
};
