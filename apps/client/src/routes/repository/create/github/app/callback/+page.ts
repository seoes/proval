import { redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';
import fetchApi from '$lib/utils';

export const ssr = false;

const ONBOARDING_PATH = '/repository/create/github';

function redirectToOnboarding(message: string): never {
    const params = new URLSearchParams({ error: message });
    redirect(303, `${ONBOARDING_PATH}?${params.toString()}`);
}

export const load: PageLoad = async ({ url }) => {
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');

    if (!code || !state) {
        redirectToOnboarding('Missing code or state');
    }

    const response = await fetchApi('/github/app/callback', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ code, state })
    });

    if (!response.ok) {
        let message = 'Failed to complete GitHub App registration';

        const data = (await response.json()) as { error?: string };
        if (data.error) {
            message = data.error;
        }

        throw new Error(message);
    }

    if (response.status === 302) {
        const location = response.headers.get('Location');
        if (location) {
            throw new Error(location);
        }
    }

    const data = (await response.json()) as { slug: string };
    if (!data.slug) {
        throw new Error('Missing slug');
    }

    redirect(303, `https://github.com/apps/${data.slug}/installations/new`);
};
