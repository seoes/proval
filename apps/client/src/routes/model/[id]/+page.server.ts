import fetchApi from '$lib/utils';
import type { ModelResponse } from '@code-review/types';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
    const response = await fetchApi(`/model/${params.id}`);
    const model: ModelResponse = await response.json();
    
    return {
        model
    };
};
