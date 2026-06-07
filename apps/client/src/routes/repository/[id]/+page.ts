import fetchApi from "$lib/utils";
import type {
    AccessResponse,
    GitHubAppResponse,
    GitHubInstallationResponse,
    ModelResponse,
    ProviderOption,
    RepositoryResponse,
    RepositorySelectItem,
} from "@proval/types";
import type { PageLoad } from "./$types";
import { error } from "@sveltejs/kit";
import { loadGitAccessRepositoryList, loadGitHubInstallationRepositoryList } from "$lib/utils/repository-list";

export const ssr = false;

export const load: PageLoad = async ({ params }) => {
    const [repositoryResponse, modelListResponse] = await Promise.all([
        fetchApi(`/repository/${params.id}`),
        fetchApi("/model"),
    ]);

    if (!repositoryResponse.ok) {
        throw error(404, "Repository not found");
    }

    const repository: RepositoryResponse = await repositoryResponse.json();
    const modelList: ModelResponse[] = modelListResponse.ok ? await modelListResponse.json() : [];

    let provider: ProviderOption;
    let repositoryList: RepositorySelectItem[];

    if (repository.provider === "github") {
        if (repository.githubInstallationId == null) {
            throw error(400, "GitHub installation is missing");
        }

        const appRes = await fetchApi("/github/app");
        if (!appRes.ok) {
            throw error(404, "GitHub App not found");
        }
        const appList: GitHubAppResponse[] = await appRes.json();
        const app = appList[0];
        if (!app) {
            throw error(404, "GitHub App not found");
        }

        const installationRes = await fetchApi(
            `/github/app/${app.id}/installation/${repository.githubInstallationId}`,
        );
        if (!installationRes.ok) {
            throw error(404, "Installation not found");
        }
        const installation: GitHubInstallationResponse = await installationRes.json();

        provider = {
            type: "github",
            githubInstallationId: installation.id,
            label: installation.accountName,
        };
        repositoryList = await loadGitHubInstallationRepositoryList(repository.githubInstallationId);
    } else {
        if (repository.gitProviderAccessId == null) {
            throw error(400, "Git provider access is missing");
        }

        const accessRes = await fetchApi(`/access/${repository.gitProviderAccessId}`);
        if (!accessRes.ok) {
            throw error(404, "Access not found");
        }
        const access: AccessResponse = await accessRes.json();

        provider = {
            type: access.provider,
            accessId: access.id,
            label: access.name,
            baseUrl: access.baseUrl,
        };
        repositoryList = await loadGitAccessRepositoryList(repository.gitProviderAccessId);
    }

    return {
        repository,
        modelList,
        repositoryList,
        provider,
    };
};
