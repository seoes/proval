import fetchApi from '$lib/utils';
import type { RepositoryResponse, ModelResponse } from '@code-review/types';
import type { PageLoad } from './$types';
import { error } from '@sveltejs/kit';

type AccessItem = {
    id: number;
    provider: 'gitlab' | 'forgejo';
    name: string;
    baseUrl: string;
    botUsername: string | null;
    createdAt: string;
    updatedAt: string;
};

export const load: PageLoad = async ({ params }) => {
    const [repositoryResponse, modelListResponse, accessResponse] = await Promise.all([
        fetchApi(`/repository/${params.id}`),
        fetchApi('/model'),
        fetchApi('/access')
    ]);

    if (!repositoryResponse.ok) {
        throw error(404, 'Repository not found');
    }

    const repository: RepositoryResponse = await repositoryResponse.json();
    const modelList: ModelResponse[] = await modelListResponse.json();
    const accessList: AccessItem[] = accessResponse.ok
        ? (await accessResponse.json()).filter((a: AccessItem) => a.provider === repository.provider)
        : [];

    return {
        repository,
        modelList,
        accessList
    };
};
