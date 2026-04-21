<script lang="ts">
    import ToggleButton from '$lib/components/atom/ToggleButton.svelte';
    import DefaultLayout from '$lib/components/layout/DefaultLayout.svelte';
    import RepositoryForm from '$lib/components/organism/RepositoryForm.svelte';
    import { siGithub, siGitlab } from 'simple-icons';
    import type { PageProps } from './$types';
    import Button from '$lib/components/atom/Button.svelte';
    import { goto } from '$app/navigation';

    let { data }: PageProps = $props();

    let providerToggleButtonValueList = [
        {
            label: 'GitLab',
            value: 'gitlab',
            description: 'Self-hosted instance or gitlab.com',
            icon: siGitlab
        },
        {
            label: 'GitHub',
            value: 'github',
            description: 'Connect via github.com',
            icon: siGithub
        }
    ];

    let selectedProvider = $state<'gitlab' | 'github'>('gitlab');
</script>

<DefaultLayout title="Create Repository">
    <div>
        <p>Select your repository's provider</p>
    </div>
    <div class="flex gap-2">
        {#each providerToggleButtonValueList as toggleButtonValue}
            <ToggleButton
                class="w-full"
                label={toggleButtonValue.label}
                selected={selectedProvider === (toggleButtonValue.value as 'gitlab' | 'github')}
                onclick={() => (selectedProvider = toggleButtonValue.value as 'gitlab' | 'github')}
                icon={toggleButtonValue.icon}
                description={toggleButtonValue.description}
            />
        {/each}
    </div>
    <!-- <RepositoryForm mode="create" modelList={data.modelList} /> -->
    <div class="mt-2">
        <Button primary onclick={() => goto(`/repository/create/${selectedProvider}`)}>Next</Button>
    </div>
</DefaultLayout>
