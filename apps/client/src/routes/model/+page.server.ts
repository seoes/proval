import fetchApi from '$lib/utils';
import type { ModelResponse } from '@code-review/types';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
    const response = await fetchApi('/model');
    const result: ModelResponse[] = await response.json();
    console.log('call');
    console.log(result);
    return {
        modelList: result
    };
};
