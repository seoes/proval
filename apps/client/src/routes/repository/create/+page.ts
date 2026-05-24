import fetchApi from "$lib/utils";
import type { ModelResponse } from "@proval/types";
import type { PageLoad } from "./$types";

export const ssr = false;

type AccessItem = {
    id: number;
    provider: "gitlab" | "forgejo";
    name: string;
    baseUrl: string;
    createdAt: string;
    updatedAt: string;
};

type GithubApp = { id: number; appId: number; slug: string };

type InstallationItem = {
    id: number;
    installationId: number;
    accountName: string;
    accountType: "User" | "Organization";
};

export type UnifiedAccessOption =
    | { kind: "git-provider"; provider: "gitlab" | "forgejo"; id: number; label: string; baseUrl: string }
    | { kind: "github-installation"; provider: "github"; id: number; label: string; accountType: string };

export const load: PageLoad = async () => {
    const [modelRes, accessRes, appRes] = await Promise.all([
        fetchApi("/model"),
        fetchApi("/access"),
        fetchApi("/github/app"),
    ]);

    const modelList: ModelResponse[] = modelRes.ok ? await modelRes.json() : [];
    const accessList: AccessItem[] = accessRes.ok ? await accessRes.json() : [];
    const appList: GithubApp[] = appRes.ok ? await appRes.json() : [];
    const app = appList.length > 0 ? appList[0] : null;

    let installationList: InstallationItem[] = [];
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
