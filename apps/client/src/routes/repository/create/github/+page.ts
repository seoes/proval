import fetchApi from '$lib/utils';
import type { ModelResponse } from '@code-review/types';
import type { PageLoad } from './$types';

export const ssr = false;

type GithubAppListItem = { id: number; appId: number; slug: string };

export const load: PageLoad = async () => {
    const [appRes, modelRes] = await Promise.all([fetchApi('/github/app'), fetchApi('/model')]);

    const appList: GithubAppListItem[] = appRes.ok ? await appRes.json() : [];
    const modelList: ModelResponse[] = modelRes.ok ? await modelRes.json() : [];

    return { appList, modelList };
};
