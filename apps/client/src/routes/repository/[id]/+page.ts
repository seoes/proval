import fetchApi from "$lib/utils";
import type { RepositoryResponse, ModelResponse } from "@proval/types";
import type { PageLoad } from "./$types";
import { error } from "@sveltejs/kit";

type AccessItem = {
    id: number;
    provider: "gitlab" | "forgejo";
    name: string;
    baseUrl: string;
    createdAt: string;
    updatedAt: string;
};

type InstallationItem = {
    id: number;
    installationId: number;
    accountName: string;
    accountType: "User" | "Organization";
};

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
    const accessList: AccessItem[] = accessResponse.ok
        ? (await accessResponse.json()).filter((a: AccessItem) => a.provider === repository.provider)
        : [];

    let installationList: InstallationItem[] = [];
    let githubApp: { id: number; appId: number; slug: string } | null = null;
    if (repository.provider === "github") {
        const appRes = await fetchApi("/github/app");
        const appList = appRes.ok ? await appRes.json() : [];
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
