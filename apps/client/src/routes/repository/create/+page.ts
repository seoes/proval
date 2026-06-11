import fetchApi from "$lib/utils";
import type {
    AccessResponse,
    GitHubAppResponse,
    GitHubInstallationResponse,
    ModelProviderResponse,
    AccessOption,
    ProviderOption,
    GitHubInstallationOption,
} from "@proval/types";
import type { PageLoad } from "./$types";

export const ssr = false;

export const load: PageLoad = async () => {
    const [modelRes, accessRes, appRes] = await Promise.all([
        fetchApi("/model-provider"),
        fetchApi("/access"),
        fetchApi("/github/app"),
    ]);

    const modelList: ModelProviderResponse[] = modelRes.ok ? await modelRes.json() : [];
    const accessList: AccessResponse[] = accessRes.ok ? await accessRes.json() : [];
    const appList: GitHubAppResponse[] = appRes.ok ? await appRes.json() : [];
    const app = appList.length > 0 ? appList[0] : null;

    let installationList: GitHubInstallationResponse[] = [];
    if (app) {
        const installationRes = await fetchApi(`/github/app/${app.id}/installation`);
        installationList = installationRes.ok ? await installationRes.json() : [];
    }

    const providerOptionList: ProviderOption[] = [
        ...accessList.map(
            (access): AccessOption => ({
                type: access.provider,
                accessId: access.id,
                label: access.name,
                baseUrl: access.baseUrl,
            }),
        ),
        ...installationList.map(
            (installation): GitHubInstallationOption => ({
                type: "github",
                githubInstallationId: installation.id,
                label: installation.accountName,
            }),
        ),
    ];

    return {
        modelList,
        providerOptionList,
    };
};
