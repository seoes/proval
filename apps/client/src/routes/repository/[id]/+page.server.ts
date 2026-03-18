import fetchApi from '$lib/utils';
import type { RepositoryResponse, ModelResponse } from '@code-review/types';
import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ params }) => {
    const [repositoryResponse, modelListResponse] = await Promise.all([
        fetchApi(`/repository/${params.id}`),
        fetchApi('/model'),
    ]);

    if (!repositoryResponse.ok) {
        throw error(404, 'Repository not found');
    }

    const repository: RepositoryResponse = await repositoryResponse.json();
    const modelList: ModelResponse[] = await modelListResponse.json();

    return {
        repository,
        modelList,
    };
};
