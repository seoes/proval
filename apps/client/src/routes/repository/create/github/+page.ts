import fetchApi from '$lib/utils';
import type { PageLoad } from './$types';

export const ssr = false;

type GithubApp = { id: number; slug: string; owner: string };

export const load: PageLoad = async () => {
    const response = await fetchApi('/github/app');
    const appList = (await response.json()) as GithubApp[];
    return {
        appList,
        installationList: [
            { id: 1, account: 'seoes', type: 'User' },
            { id: 2, account: 'myorg', type: 'Organization' }
        ],
        repoList: [
            { id: 1, fullName: 'seoes/code-review' },
            { id: 2, fullName: 'seoes/my-project' },
            { id: 3, fullName: 'myorg/team-repo' }
        ],
        modelList: [
            { id: 1, label: 'GPT-4o' },
            { id: 2, label: 'Claude 3.5 Sonnet' }
        ]
    };
};
