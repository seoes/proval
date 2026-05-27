import fetchApi from "$lib/utils";
import type {
    AccessResponse,
    GitHubAppResponse,
    GitHubInstallationResponse,
    ModelResponse,
    UnifiedAccessOption,
} from "@proval/types";
import type { PageLoad } from "./$types";

export const ssr = false;

export const load: PageLoad = async () => {
    const [modelRes, accessRes, appRes] = await Promise.all([
        fetchApi("/model"),
        fetchApi("/access"),
        fetchApi("/github/app"),
    ]);

    const modelList: ModelResponse[] = modelRes.ok ? await modelRes.json() : [];
    const accessList: AccessResponse[] = accessRes.ok ? await accessRes.json() : [];
    const appList: GitHubAppResponse[] = appRes.ok ? await appRes.json() : [];
    const app = appList.length > 0 ? appList[0] : null;

    let installationList: GitHubInstallationResponse[] = [];
    if (app) {
        const installationRes = await fetchApi(`/github/app/${app.id}/installation`);
        installationList = installationRes.ok ? await installationRes.json() : [];
    }

    const unifiedAccessOptions: UnifiedAccessOption[] = [
        ...accessList.map(
            (access): UnifiedAccessOption => ({
                kind: "git-provider",
                provider: access.provider,
                id: access.id,
                label: access.name,
                baseUrl: access.baseUrl,
            }),
        ),
        ...installationList.map(
            (installation): UnifiedAccessOption => ({
                kind: "github-installation",
                provider: "github",
                id: installation.id,
                label: installation.accountName,
                accountType: installation.accountType,
            }),
        ),
    ];

    return {
        modelList,
        accessList,
        app,
        installationList,
        unifiedAccessOptions,
    };
};
