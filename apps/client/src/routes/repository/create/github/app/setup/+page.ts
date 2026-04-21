import { redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';
import fetchApi from '$lib/utils';

export const load: PageLoad = async ({ url }) => {
    const installationId = url.searchParams.get('installation_id');
    const setupAction = url.searchParams.get('setup_action');

    if (!installationId) {
        throw new Error('Missing installation_id');
    }

    if (setupAction !== 'install') {
        throw new Error('Missing or invalid setup_action');
    }

    const response = await fetchApi('/github/app/setup', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            installationId,
            setupAction
        })
    });

    if (!response.ok) {
        let message = 'Failed to complete GitHub App setup';
        const data = (await response.json()) as { error?: string };
        if (data.error) {
            message = data.error;
        }

        throw new Error(message);
    }

    redirect(303, '/repository/create/github');
};
