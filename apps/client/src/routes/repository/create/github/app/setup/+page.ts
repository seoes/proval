import { redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';
import fetchApi from '$lib/utils';

export const ssr = false;

export const load: PageLoad = async ({ url }) => {
    const installationId = url.searchParams.get('installation_id');
    const setupAction = url.searchParams.get('setup_action');

    if (!installationId) {
        redirect(303, '/settings/integration?error=missing_installation_id');
    }

    if (setupAction !== 'install') {
        redirect(303, '/settings/integration?error=invalid_setup_action');
    }

    const response = await fetchApi('/github/app/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ installationId, setupAction })
    });

    if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        redirect(303, `/settings/integration?error=${encodeURIComponent(data.error || 'installation_failed')}`);
    }

    redirect(303, '/settings/integration?success=installation_added');
};
