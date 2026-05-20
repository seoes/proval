import fetchApi from '$lib/utils';
import type { ModelResponse } from '@code-review/types';
import type { PageLoad } from './$types';

type AccessItem = {
    id: number;
    provider: 'gitlab' | 'forgejo';
    name: string;
    baseUrl: string;
    botUsername: string | null;
    createdAt: string;
    updatedAt: string;
};

export const load: PageLoad = async () => {
    const [modelRes, accessRes] = await Promise.all([
        fetchApi('/model'),
        fetchApi('/access')
    ]);

    const modelList: ModelResponse[] = modelRes.ok ? await modelRes.json() : [];
    const accessList: AccessItem[] = accessRes.ok
        ? (await accessRes.json()).filter((a: AccessItem) => a.provider === 'forgejo')
        : [];

    return {
        modelList,
        accessList
    };
};
