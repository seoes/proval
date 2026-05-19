<script lang="ts">
    import ToggleButton from '$lib/components/atom/ToggleButton.svelte';
    import DefaultLayout from '$lib/components/layout/DefaultLayout.svelte';
    import { siForgejo, siGithub, siGitlab } from 'simple-icons';
    import Button from '$lib/components/atom/Button.svelte';
    import { goto } from '$app/navigation';

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
        },
        {
            label: 'Forgejo',
            value: 'forgejo',
            description: 'Self-hosted Forgejo or Gitea instance',
            icon: siForgejo
        }
    ];

    let selectedProvider = $state<'gitlab' | 'github' | 'forgejo'>('gitlab');
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
                selected={selectedProvider ===
                    (toggleButtonValue.value as 'gitlab' | 'github' | 'forgejo')}
                onclick={() =>
                    (selectedProvider = toggleButtonValue.value as 'gitlab' | 'github' | 'forgejo')}
                icon={toggleButtonValue.icon}
                description={toggleButtonValue.description}
            />
        {/each}
    </div>
    <div class="mt-2">
        <Button primary onclick={() => goto(`/repository/create/${selectedProvider}`)}>Next</Button>
    </div>
</DefaultLayout>
