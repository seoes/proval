<script lang="ts">
    import DefaultLayout from '$lib/components/layout/DefaultLayout.svelte';
    import InputText from '$lib/components/atom/InputText.svelte';
    import FormField from '$lib/components/molecule/FormField.svelte';
    import ToggleButton from '$lib/components/atom/ToggleButton.svelte';
    import ToggleSwitch from '$lib/components/atom/ToggleSwitch.svelte';
    import Card from '$lib/components/layout/Card.svelte';
    import Button from '$lib/components/atom/Button.svelte';
    import { goto } from '$app/navigation';
    import fetchApi from '$lib/utils';
    import { openAlert, openConfirm } from '$lib/store/modal';
    import { onMount } from 'svelte';
    import type { PageProps } from './$types';

    type InstallationRow = {
        id: number;
        installationId: number;
        accountName: string;
        accountType: 'User' | 'Organization';
    };
    type RepoRow = { id: number; fullName: string; private: boolean; alreadyConnected: boolean };
    type ReplyMode = 'all' | 'mentioned_only' | 'off';

    let { data }: PageProps = $props();

    let step = $state(1);
    let isFetching = $state(false);

    let appId = $state<number | null>(null);
    let installationList = $state<InstallationRow[]>([]);
    let selectedInstallationId = $state('');

    let repoList = $state<RepoRow[]>([]);
    let repoSearch = $state('');
    let selectedRepoPath = $state('');
    let selectedGithubRepoId = $state(0);

    let name = $state('');
    let modelId = $state('');
    let language = $state('English');
    let reviewOnMergeRequestOpen = $state(true);
    let replyMode = $state<ReplyMode>('all');
    let inlineReview = $state(true);
    let deepResearchOnMergeRequest = $state(false);

    const filteredRepoList = $derived(
        repoSearch.trim()
            ? repoList.filter((r) =>
                  r.fullName.toLowerCase().includes(repoSearch.trim().toLowerCase())
              )
            : repoList
    );

    onMount(async () => {
        // Check if app exists
        if (!data.app) {
            await openAlert(
                'GitHub App is not registered. Please register it in Settings > Integration.'
            );
            goto('/settings/integration');
            return;
        }

        appId = data.app.id;

        // Load installations
        isFetching = true;
        try {
            const res = await fetchApi(`/github/app/${appId}/installation`);
            if (res.ok) {
                installationList = await res.json();

                console.log('installationList', installationList);
                // Filter only saved installations

                if (installationList.length === 0) {
                    await openAlert(
                        'Installation is not found. Please add it in Settings > Integration.'
                    );
                    goto('/settings/integration');
                    return;
                }
            }
        } finally {
            isFetching = false;
        }
    });

    async function continueToRepositories() {
        if (!appId || !selectedInstallationId) return;
        isFetching = true;
        try {
            const res = await fetchApi(
                `/github/app/${appId}/installation/${selectedInstallationId}/repository`
            );
            if (!res.ok) {
                await openAlert('Could not load repositories');
                return;
            }
            repoList = await res.json();
            selectedRepoPath = '';
            selectedGithubRepoId = 0;
            repoSearch = '';
            step = 2;
        } finally {
            isFetching = false;
        }
    }

    function onRepoSelectChange() {
        const r = repoList.find((x) => x.fullName === selectedRepoPath);
        selectedGithubRepoId = r?.id ?? 0;
    }

    async function continueToSettings() {
        if (!selectedRepoPath || !selectedGithubRepoId) {
            await openAlert('Select a repository');
            return;
        }
        const r = repoList.find((x) => x.fullName === selectedRepoPath);
        if (r?.alreadyConnected) {
            await openAlert('This repository is already connected to Proval');
            return;
        }
        name = selectedRepoPath.split('/')[1] || selectedRepoPath;
        step = 3;
    }

    async function handleSubmit(e: Event) {
        e.preventDefault();

        if (!name) {
            await openAlert('Name is required');
            return;
        }
        if (!modelId) {
            await openAlert('Model is required');
            return;
        }
        if (!appId || !selectedInstallationId || !selectedRepoPath || !selectedGithubRepoId) {
            await openAlert('Missing GitHub selection');
            return;
        }

        const ok = await openConfirm('Create this repository?');
        if (!ok) return;

        const res = await fetchApi('/repository', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name,
                provider: 'github',
                baseUrl: 'https://api.github.com',
                gitlabAccessToken: null,
                botUsername: null,
                language,
                githubInstallationId: parseInt(selectedInstallationId, 10),
                githubRepositoryPath: selectedRepoPath,
                githubRepositoryId: selectedGithubRepoId,
                gitlabRepositoryId: null,
                modelId: parseInt(modelId, 10),
                reviewOnMergeRequestOpen,
                replyToMergeRequestComment: replyMode,
                inlineReview,
                deepResearchOnMergeRequest,
                commentOnIssueOpen: false,
                replyToIssueComment: 'off'
            })
        });

        const errBody = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
            await openAlert(errBody.error ?? 'Failed to create repository');
            return;
        }

        goto('/repository');
    }

    const replyModeOptions: { label: string; value: ReplyMode; description: string }[] = [
        {
            label: 'All',
            value: 'all',
            description: 'Reply on all PR conversation comments'
        },
        {
            label: 'Mentioned only',
            value: 'mentioned_only',
            description: 'Reply only when the app is @mentioned'
        },
        { label: 'Off', value: 'off', description: 'Do not reply to PR comments' }
    ];
</script>

<DefaultLayout narrow title="Create GitHub Repository">
    <div class="space-y-6">
        <div class="flex items-center gap-2 text-sm">
            {#each [1, 2, 3] as s}
                <div class="flex items-center">
                    <div
                        class="flex h-8 w-8 items-center justify-center rounded-full {step >= s
                            ? 'bg-primary text-white'
                            : 'bg-neutral-200 text-neutral-500 dark:bg-neutral-700'}"
                    >
                        {s}
                    </div>
                    {#if s < 3}
                        <div
                            class="h-0.5 w-8 {step > s
                                ? 'bg-primary'
                                : 'bg-neutral-200 dark:bg-neutral-700'}"
                        ></div>
                    {/if}
                </div>
            {/each}
        </div>

        {#if isFetching && step === 1}
            <Card>
                <p class="text-neutral-500">Loading...</p>
            </Card>
        {:else if step === 1}
            <Card title="Step 1: Installation">
                <div class="space-y-4">
                    <FormField
                        label="Installation"
                        description="Select an installation to connect repositories from"
                        linkLabelToControl={false}
                    >
                        {#snippet children({ id: _id })}
                            <div class="mt-3 flex flex-wrap gap-2" id={_id} role="group">
                                {#each installationList as installation}
                                    <button
                                        type="button"
                                        class="min-w-32 rounded-lg border p-3 text-left transition-colors {selectedInstallationId ===
                                        installation.id.toString()
                                            ? 'border-primary bg-primary/10'
                                            : 'border-neutral-200 hover:border-neutral-300 dark:border-neutral-700'}"
                                        onclick={() =>
                                            (selectedInstallationId = installation.id.toString())}
                                    >
                                        <div class="font-medium">{installation.accountName}</div>
                                        <div class="text-sm text-neutral-500">
                                            {installation.accountType}
                                        </div>
                                    </button>
                                {/each}
                            </div>
                        {/snippet}
                    </FormField>
                    <Button
                        primary
                        onclick={continueToRepositories}
                        disabled={!selectedInstallationId || isFetching}
                    >
                        {isFetching ? 'Loading...' : 'Continue'}
                    </Button>
                </div>
            </Card>
        {/if}

        {#if step === 2}
            <Card title="Step 2: Repository">
                {#if repoList.length === 0}
                    <p class="text-neutral-500">
                        No repositories accessible for this installation.
                    </p>
                {:else}
                    <div class="space-y-4">
                        <FormField label="Search" description="Filter by name">
                            {#snippet children({ id })}
                                <InputText {id} placeholder="owner/repo" bind:value={repoSearch} />
                            {/snippet}
                        </FormField>
                        <FormField label="Repository">
                            {#snippet children({ id })}
                                <select
                                    {id}
                                    class="h-10 w-full rounded-xl border border-neutral-200 bg-gray-50 px-4 text-sm outline-none dark:border-neutral-700 dark:bg-neutral-800"
                                    bind:value={selectedRepoPath}
                                    onchange={onRepoSelectChange}
                                >
                                    <option value="">Select a repository</option>
                                    {#each filteredRepoList as repo}
                                        <option
                                            value={repo.fullName}
                                            disabled={repo.alreadyConnected}
                                        >
                                            {repo.fullName}{repo.private
                                                ? ' (private)'
                                                : ''}{repo.alreadyConnected
                                                ? ' — already connected'
                                                : ''}
                                        </option>
                                    {/each}
                                </select>
                            {/snippet}
                        </FormField>
                        <Button
                            primary
                            onclick={continueToSettings}
                            disabled={!selectedRepoPath || !selectedGithubRepoId}
                        >
                            Continue
                        </Button>
                    </div>
                {/if}
            </Card>
        {/if}

        {#if step === 3}
            <form onsubmit={handleSubmit} class="space-y-6">
                <Card>
                    <div class="space-y-4">
                        <FormField
                            label="Repository"
                            description="Selected GitHub repository"
                            linkLabelToControl={false}
                        >
                            {#snippet children({ id })}
                                <p
                                    {id}
                                    class="mt-1 font-medium text-neutral-700 dark:text-neutral-300"
                                >
                                    {selectedRepoPath}
                                </p>
                            {/snippet}
                        </FormField>
                        <FormField label="Name" description="Display name in Proval">
                            {#snippet children({ id })}
                                <InputText {id} placeholder="My Project" bind:value={name} />
                            {/snippet}
                        </FormField>
                        <FormField label="Model">
                            {#snippet children({ id })}
                                <select
                                    {id}
                                    bind:value={modelId}
                                    class="h-10 w-full rounded-xl border border-neutral-200 bg-gray-50 px-4 text-sm outline-none dark:border-neutral-700 dark:bg-neutral-800"
                                >
                                    <option value="">Select a model</option>
                                    {#each data.modelList as model}
                                        <option value={model.id.toString()}>{model.label}</option>
                                    {/each}
                                </select>
                            {/snippet}
                        </FormField>
                        <FormField label="Language">
                            {#snippet children({ id })}
                                <InputText {id} placeholder="English" bind:value={language} />
                            {/snippet}
                        </FormField>
                    </div>
                </Card>

                <Card title="Pull request review">
                    <div class="space-y-4">
                        <div class="flex items-center justify-between gap-2">
                            <FormField
                                class="min-w-0 flex-1 pr-2"
                                label="Review when PR opens"
                                description="Run review on new pull requests"
                                linkLabelToControl={false}
                            />
                            <ToggleSwitch bind:checked={reviewOnMergeRequestOpen} />
                        </div>
                        <div class="flex items-center justify-between gap-2">
                            <FormField
                                class="min-w-0 flex-1 pr-2"
                                label="Inline comments"
                                description="Allow line-level review comments"
                                linkLabelToControl={false}
                            />
                            <ToggleSwitch bind:checked={inlineReview} />
                        </div>
                        <div class="flex items-center justify-between gap-2">
                            <FormField
                                class="min-w-0 flex-1 pr-2"
                                label="Deep research"
                                description="Multi-step research before commenting"
                                linkLabelToControl={false}
                            />
                            <ToggleSwitch bind:checked={deepResearchOnMergeRequest} />
                        </div>
                        <div>
                            <FormField
                                label="Reply to PR comments"
                                description="Conversation comments on the PR"
                                linkLabelToControl={false}
                            >
                                {#snippet children({ id: _id })}
                                    <div class="mt-3 flex flex-wrap gap-2" id={_id} role="group">
                                        {#each replyModeOptions as option}
                                            <ToggleButton
                                                label={option.label}
                                                description={option.description}
                                                selected={replyMode === option.value}
                                                onclick={() => (replyMode = option.value)}
                                                class="min-w-28 flex-1"
                                            />
                                        {/each}
                                    </div>
                                {/snippet}
                            </FormField>
                        </div>
                    </div>
                </Card>

                <div class="flex justify-between">
                    <Button primary type="submit">Create</Button>
                    <Button text type="button" onclick={() => goto('/repository')}>Cancel</Button>
                </div>
            </form>
        {/if}
    </div>
</DefaultLayout>
