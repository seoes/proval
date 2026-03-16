import fetchApi from '$lib/utils';
import type { RepositoryResponse } from '@code-review/types';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
    const response = await fetchApi('/repository');
    const result: RepositoryResponse[] = await response.json();
    console.log('call');
    console.log(result);
    return {
        repositoryList: result
    };
};
