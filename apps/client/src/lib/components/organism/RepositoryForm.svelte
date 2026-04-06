<script lang="ts">
    import InputText from '../atom/InputText.svelte';
    import { goto } from '$app/navigation';
    import fetchApi from '$lib/utils';
    import type { ModelResponse } from '@code-review/types';
    import LabelWithDescription from '../molecule/LabelWithDescription.svelte';
    import ToggleButton from '../atom/ToggleButton.svelte';
    import { siForgejo, siGitea, siGithub, siGitlab } from 'simple-icons';
    import Card from '../layout/Card.svelte';
    import Button from '../atom/Button.svelte';
    import { openAlert, openConfirm } from '$lib/store/modal';

    interface Props {
        mode: 'create' | 'edit';
        repositoryId?: number;
        modelList: ModelResponse[];
        initialData?: {
            name: string;
            provider: string;
            baseUrl: string;
            apiToken: string;
            webhookSecret: string;
            botUsername: string;
            reviewMode: string;
            replyMode: string;
            autoAssign: boolean;
            allowApproval: boolean;
            language: string;
            githubRepositoryPath: string | null;
            gitlabRepositoryId: number | null;
            modelId: number | null;
        };
        border?: boolean;
    }

    let { mode, repositoryId, modelList, initialData, border = true }: Props = $props();

    console.log(initialData);
    console.log(modelList);

    let name = $state(initialData?.name ?? '');
    let provider = $state(initialData?.provider ?? 'gitlab');
    let baseUrl = $state(initialData?.baseUrl ?? '');
    let apiToken = $state(initialData?.apiToken ?? '');
    let webhookSecret = $state(initialData?.webhookSecret ?? '');
    let botUsername = $state(initialData?.botUsername ?? '');
    let reviewMode = $state(initialData?.reviewMode ?? 'off');
    let replyMode = $state(initialData?.replyMode ?? 'off');
    let autoAssign = $state(initialData?.autoAssign ?? false);
    let allowApproval = $state(initialData?.allowApproval ?? false);
    let language = $state(initialData?.language ?? 'English');
    let gitlabRepositoryId = $state(initialData?.gitlabRepositoryId?.toString() ?? '');
    let modelId = $state(initialData?.modelId?.toString() ?? '');

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
        if (!language) {
            await openAlert('Language is required');
            return;
        }
        if (!provider) {
            await openAlert('Provider is required');
            return;
        }
        if (!baseUrl) {
            await openAlert('Base URL is required');
            return;
        }
        if (provider === 'gitlab' && !gitlabRepositoryId) {
            await openAlert('GitLab Repository ID is required');
            return;
        }
        if (mode === 'create' && !apiToken) {
            await openAlert('API Token is required');
            return;
        }
        if (mode === 'create' && !webhookSecret) {
            await openAlert('Webhook Secret is required');
            return;
        }
        if (!reviewMode) {
            await openAlert('Review Mode is required');
            return;
        }
        if (!replyMode) {
            await openAlert('Reply Mode is required');
            return;
        }
        if (!language) {
            await openAlert('Language is required');
            return;
        }

        if (mode === 'create') {
            const confirm = await openConfirm('Create this repository?');
            if (!confirm) return;
            const body = {
                name,
                provider,
                baseUrl,
                apiToken,
                webhookSecret: webhookSecret || null,
                botUsername: botUsername || null,
                reviewMode,
                replyMode,
                autoAssign,
                allowApproval,
                language,
                gitlabRepositoryId: gitlabRepositoryId ? parseInt(gitlabRepositoryId) : null,
                modelId: modelId ? parseInt(modelId) : null
            };

            await fetchApi('/repository', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
        } else {
            const confirm = await openConfirm('Update this repository?');
            if (!confirm) return;
            const body = {
                name,
                provider,
                baseUrl,
                botUsername: botUsername || null,
                reviewMode,
                replyMode,
                autoAssign,
                allowApproval,
                language,
                gitlabRepositoryId: gitlabRepositoryId ? parseInt(gitlabRepositoryId) : null,
                modelId: modelId ? parseInt(modelId) : null
            };

            await fetchApi(`/repository/${repositoryId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
        }

        goto('/repository');
    }

    async function removeRepository(repositoryId: number) {
        const confirmed = await openConfirm('Are you sure you want to remove this repository?');
        if (!confirmed) return;
        await fetchApi(`/repository/${repositoryId}`, {
            method: 'DELETE'
        });
        await openAlert('Repository removed successfully');
        goto('/repository');
    }

    const gitProviderToggleButtonValueList = [
        {
            label: 'GitLab',
            // description: 'GitLab',
            value: 'gitlab',
            icon: siGitlab
        }
        // {
        //     label: 'GitHub',
        //     // description: 'GitHub',
        //     value: 'github',
        //     icon: siGithub
        // },
        // {
        //     label: 'Gitea',
        //     // description: 'Gitea',
        //     value: 'gitea',
        //     icon: siGitea
        // },
        // {
        //     label: 'Forgejo',
        //     // description: 'Forgejo',
        //     value: 'forgejo',
        //     icon: siForgejo
        // }
    ];

    const assignedOnlyToggleButtonValue = {
        label: 'Assigned Only',
        value: 'assigned_only'
    };

    const mentionedOnlyToggleButtonValue = {
        label: 'Mentioned Only',
        value: 'mentioned_only'
    };

    const offToggleButtonValue = {
        label: 'Off',
        value: 'off'
    };

    const replyModeToggleButtonValueList = [
        {
            ...assignedOnlyToggleButtonValue,
            description: 'Bot will reply to every comment in assigned Merge Requests only'
        },
        {
            ...mentionedOnlyToggleButtonValue,
            description: 'Bot will reply to every mentioned comment'
        },
        {
            ...offToggleButtonValue,
            description: 'Bot will not reply to any comments'
        }
    ];
    const reviewModeToggleButtonValueList = [
        {
            ...assignedOnlyToggleButtonValue,
            description: 'Bot will only review assigned Merge Requests only'
        },
        {
            ...offToggleButtonValue,
            description: 'Bot will not review any Merge Requests'
        }
    ];
</script>

<form onsubmit={handleSubmit} class="space-y-8">
    <Card>
        <div>
            <LabelWithDescription label="Name" description="The name of the repository" />
            <InputText placeholder="My Project" bind:value={name} />
        </div>
        <!-- <div>
                <label class="mb-1 block text-sm font-medium text-neutral-700"
                    >Bot Username (optional)</label
                >
                <InputText placeholder="project_123_bot" bind:value={botUsername} />
            </div> -->

        <div>
            <LabelWithDescription
                label="Model"
                description="Select the model to use for the repository"
            />
            <select
                bind:value={modelId}
                class="h-10 w-full rounded-xl border border-neutral-200 bg-gray-50 px-4 text-sm outline-none dark:border-neutral-700 dark:bg-neutral-800"
            >
                <option value="">Select a model</option>
                {#each modelList as model}
                    <option value={model.id.toString()}>{model.label}</option>
                {/each}
            </select>
        </div>
        <div>
            <LabelWithDescription label="Language" description="Default language for code review" />
            <InputText placeholder="English" bind:value={language} />
        </div>
    </Card>
    <Card title="Git Provider">
        <div>
            <LabelWithDescription
                label="Provider"
                description="The provider of the repository (ex. GitLab, Forgejo)"
            />
            <div class="mt-4 flex gap-2">
                {#each gitProviderToggleButtonValueList as toggleButtonValue}
                    <ToggleButton
                        // class="max-h-28"
                        label={toggleButtonValue.label}
                        selected={provider === toggleButtonValue.value}
                        onclick={() => (provider = toggleButtonValue.value)}
                        icon={toggleButtonValue.icon}
                    />
                {/each}
            </div>
        </div>
        <div>
            <LabelWithDescription
                label="Base URL"
                description="The base URL of the repository (ex. https://gitlab.com, http://127.0.0.1:8080)"
                class="mb-2 pl-1"
            />
            <InputText placeholder="https://gitlab.com" bind:value={baseUrl} />
        </div>
        {#if provider === 'gitlab'}
            <div>
                <LabelWithDescription
                    label="GitLab Repository ID"
                    description="ID of the GitLab repository"
                />
                <InputText placeholder="12345" bind:value={gitlabRepositoryId} />
            </div>
        {/if}

        {#if mode === 'create'}
            <div>
                <LabelWithDescription
                    label="API Token"
                    description="The API token of the repository"
                />
                <InputText placeholder="glpat-..." bind:value={apiToken} password />
            </div>
            <div>
                <label class="mb-1 block text-sm font-medium text-neutral-700"
                    >Webhook Secret (optional)</label
                >
                <InputText placeholder="secret" bind:value={webhookSecret} password />
            </div>
        {/if}
    </Card>
    <Card title="Merge Request">
        <div>
            <LabelWithDescription
                label="Assign to Every New Merge Request"
                description="Automatically assign reviewers to every Merge Request"
            />
            <input
                type="checkbox"
                bind:checked={autoAssign}
                class="mt-2 h-5 w-5 rounded border-neutral-200"
            />
        </div>
        <div>
            <LabelWithDescription
                label="Allow Approve / Reject"
                description="Allow the review agent to autonomously approve or reject Merge Requests based on review findings"
            />
            <input
                type="checkbox"
                bind:checked={allowApproval}
                class="mt-2 h-5 w-5 rounded border-neutral-200"
            />
        </div>
        <div>
            <LabelWithDescription
                label="Review Mode"
                description="Model will only review when the bot is assigned with the Merge Request"
            />
            <div class="mt-4 flex gap-2">
                {#each reviewModeToggleButtonValueList as toggleButtonValue}
                    <ToggleButton
                        label={toggleButtonValue.label}
                        description={toggleButtonValue.description}
                        selected={reviewMode === toggleButtonValue.value}
                        onclick={() => (reviewMode = toggleButtonValue.value)}
                    />
                {/each}
            </div>
        </div>
        <div>
            <LabelWithDescription
                label="Reply Mode"
                description="If Mentioned Only, bot will only reply when the bot is mentioned"
            />
            <div class="mt-4 flex gap-2">
                {#each replyModeToggleButtonValueList as toggleButtonValue}
                    <ToggleButton
                        label={toggleButtonValue.label}
                        description={toggleButtonValue.description}
                        selected={replyMode === toggleButtonValue.value}
                        onclick={() => (replyMode = toggleButtonValue.value)}
                    />
                {/each}
            </div>
        </div>
    </Card>

    <div class="-mt-2 flex justify-between">
        <div class="flex gap-4">
            <Button primary type="submit">{mode === 'create' ? 'Create' : 'Save'}</Button>
        </div>
        <div class="mr-4">
            {#if mode === 'edit' && repositoryId}
                <Button
                    text
                    onclick={() => {
                        removeRepository(repositoryId);
                    }}>Remove Repository</Button
                >
            {:else if mode === 'create'}
                <Button text onclick={() => goto('/repository')}>Cancel</Button>
            {/if}
        </div>
    </div>
</form>

<style>
    * {
        font-family: 'Wanted Sans Variable', sans-serif;
    }
</style>
