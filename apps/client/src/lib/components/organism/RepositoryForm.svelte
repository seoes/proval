<script lang="ts">
    import InputText from '../atom/InputText.svelte';
    import { goto } from '$app/navigation';
    import fetchApi from '$lib/utils';
    import type { ModelResponse } from '@code-review/types';
    import FormField from '../molecule/FormField.svelte';
    import ToggleButton from '../atom/ToggleButton.svelte';
    import { siForgejo, siGitea, siGithub, siGitlab } from 'simple-icons';
    import Card from '../layout/Card.svelte';
    import Button from '../atom/Button.svelte';
    import { openAlert, openConfirm } from '$lib/store/modal';
    import Description from '../atom/Description.svelte';

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
            inlineReviewMode?: string;
            reviewDepth?: string;
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
    let inlineReviewMode = $state(initialData?.inlineReviewMode ?? 'important_only');
    let reviewDepth = $state(initialData?.reviewDepth ?? 'standard');
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
                modelId: modelId ? parseInt(modelId) : null,
                inlineReviewMode,
                reviewDepth
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
                modelId: modelId ? parseInt(modelId) : null,
                inlineReviewMode,
                reviewDepth
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

    const inlineReviewModeOptions: { label: string; value: string; description: string }[] = [
        {
            label: 'Off',
            value: 'off',
            description: 'Summary comment only; no inline line comments'
        },
        {
            label: 'Important only',
            value: 'important_only',
            description: 'Inline for Critical/Warning (capped)'
        },
        {
            label: 'Balanced',
            value: 'balanced',
            description: 'More inline threads including some suggestions (capped)'
        }
    ];

    const reviewDepthOptions: { label: string; value: string; description: string }[] = [
        {
            label: 'Standard',
            value: 'standard',
            description: 'Extra context only when needed'
        },
        {
            label: 'Deep',
            value: 'deep',
            description: 'More exploration of related files and call paths'
        }
    ];
</script>

<form onsubmit={handleSubmit} class="space-y-8">
    <Card spaceY>
        <div>
            <FormField label="Name" description="The name of the repository">
                {#snippet children({ id })}
                    <InputText {id} placeholder="My Project" bind:value={name} />
                {/snippet}
            </FormField>
        </div>

        <div>
            <FormField label="Model" description="Select the model to use for the repository">
                {#snippet children({ id })}
                    <select
                        {id}
                        bind:value={modelId}
                        class="h-10 w-full rounded-xl border border-neutral-200 bg-gray-50 px-4 text-sm outline-none dark:border-neutral-700 dark:bg-neutral-800"
                    >
                        <option value="">Select a model</option>
                        {#each modelList as model}
                            <option value={model.id.toString()}>{model.label}</option>
                        {/each}
                    </select>
                {/snippet}
            </FormField>
        </div>
        <div>
            <FormField label="Language" description="Default language for code review">
                {#snippet children({ id })}
                    <InputText {id} placeholder="English" bind:value={language} />
                {/snippet}
            </FormField>
        </div>
    </Card>
    <Card title="Git Provider" spaceY>
        <div>
            <FormField
                label="Provider"
                description="The provider of the repository (ex. GitLab, Forgejo)"
                upper
                linkLabelToControl={false}
            >
                {#snippet children({ id: _id })}
                    <div class="flex h-24 gap-2" id={_id} role="group">
                        {#each gitProviderToggleButtonValueList as toggleButtonValue}
                            <ToggleButton
                                label={toggleButtonValue.label}
                                selected={provider === toggleButtonValue.value}
                                onclick={() => (provider = toggleButtonValue.value)}
                                icon={toggleButtonValue.icon}
                            />
                        {/each}
                    </div>
                {/snippet}
            </FormField>
        </div>
        <div>
            <FormField
                class="mb-2 pl-1"
                label="Base URL"
                description="The base URL of the repository (ex. https://gitlab.com, http://127.0.0.1:8080)"
            >
                {#snippet children({ id })}
                    <InputText {id} placeholder="https://gitlab.com" bind:value={baseUrl} />
                {/snippet}
            </FormField>
        </div>
        {#if provider === 'gitlab'}
            <div>
                <FormField label="GitLab Repository ID" description="ID of the GitLab repository">
                    {#snippet children({ id })}
                        <InputText {id} placeholder="12345" bind:value={gitlabRepositoryId} />
                    {/snippet}
                </FormField>
            </div>
        {/if}

        {#if mode === 'create'}
            <div>
                <FormField label="API Token" description="The API token of the repository">
                    {#snippet children({ id })}
                        <InputText {id} placeholder="glpat-..." bind:value={apiToken} password />
                    {/snippet}
                </FormField>
            </div>
            <div>
                <FormField label="Webhook Secret (optional)">
                    {#snippet children({ id })}
                        <InputText {id} placeholder="secret" bind:value={webhookSecret} password />
                    {/snippet}
                </FormField>
            </div>
        {:else}
            <div class="mt-8">
                <Description
                    >API Token and Webhook Secret can be updated in the list page</Description
                >
            </div>
        {/if}
    </Card>
    <Card title="Merge Request" spaceY>
        <div>
            <FormField
                label="Inline review"
                description="Post findings on specific diff lines (GitLab discussions) vs summary-only"
                linkLabelToControl={false}
            >
                {#snippet children({ id: _id })}
                    <div class="flex h-36 gap-2" id={_id} role="group">
                        {#each inlineReviewModeOptions as opt}
                            <ToggleButton
                                label={opt.label}
                                description={opt.description}
                                selected={inlineReviewMode === opt.value}
                                onclick={() => (inlineReviewMode = opt.value)}
                                class="min-w-[8rem] flex-1"
                            />
                        {/each}
                    </div>
                {/snippet}
            </FormField>
        </div>
        <div>
            <FormField
                label="Review depth"
                description="How much the agent explores surrounding code beyond the diff"
                linkLabelToControl={false}
            >
                {#snippet children({ id: _id })}
                    <div class="flex h-36 gap-2" id={_id} role="group">
                        {#each reviewDepthOptions as opt}
                            <ToggleButton
                                label={opt.label}
                                description={opt.description}
                                selected={reviewDepth === opt.value}
                                onclick={() => (reviewDepth = opt.value)}
                            />
                        {/each}
                    </div>
                {/snippet}
            </FormField>
        </div>
        <div>
            <FormField
                label="Assign to Every New Merge Request"
                description="Automatically assign reviewers to every Merge Request"
            >
                {#snippet children({ id })}
                    <input
                        {id}
                        type="checkbox"
                        bind:checked={autoAssign}
                        class="h-5 w-5 rounded border-neutral-200"
                    />
                {/snippet}
            </FormField>
        </div>
        <div>
            <FormField
                label="Allow Approve / Reject"
                description="Allow the review agent to autonomously approve or reject Merge Requests based on review findings"
            >
                {#snippet children({ id })}
                    <input
                        {id}
                        type="checkbox"
                        bind:checked={allowApproval}
                        class="h-5 w-5 rounded border-neutral-200"
                    />
                {/snippet}
            </FormField>
        </div>
        <div>
            <FormField
                label="Review Mode"
                description="Model will only review when the bot is assigned with the Merge Request"
                linkLabelToControl={false}
            >
                {#snippet children({ id: _id })}
                    <div class="flex h-36 gap-2" id={_id} role="group">
                        {#each reviewModeToggleButtonValueList as toggleButtonValue}
                            <ToggleButton
                                label={toggleButtonValue.label}
                                description={toggleButtonValue.description}
                                selected={reviewMode === toggleButtonValue.value}
                                onclick={() => (reviewMode = toggleButtonValue.value)}
                            />
                        {/each}
                    </div>
                {/snippet}
            </FormField>
        </div>
        <div>
            <FormField
                label="Reply Mode"
                description="If Mentioned Only, bot will only reply when the bot is mentioned"
                linkLabelToControl={false}
            >
                {#snippet children({ id: _id })}
                    <div class="flex h-36 gap-2" id={_id} role="group">
                        {#each replyModeToggleButtonValueList as toggleButtonValue}
                            <ToggleButton
                                label={toggleButtonValue.label}
                                description={toggleButtonValue.description}
                                selected={replyMode === toggleButtonValue.value}
                                onclick={() => (replyMode = toggleButtonValue.value)}
                            />
                        {/each}
                    </div>
                {/snippet}
            </FormField>
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
