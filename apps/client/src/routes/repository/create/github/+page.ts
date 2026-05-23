import fetchApi from "$lib/utils";
import type { ModelResponse } from "@proval/types";
import type { PageLoad } from "./$types";

export const ssr = false;

type GithubApp = { id: number; appId: number; slug: string };

export const load: PageLoad = async () => {
    const [appRes, modelRes] = await Promise.all([fetchApi("/github/app"), fetchApi("/model")]);

    const appList: GithubApp[] = appRes.ok ? await appRes.json() : [];
    const modelList: ModelResponse[] = modelRes.ok ? await modelRes.json() : [];

    return {
        app: appList.length > 0 ? appList[0] : null,
        modelList: modelList ?? [],
    };
};
