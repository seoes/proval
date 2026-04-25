<script lang="ts">
    import InputText from '../atom/InputText.svelte';
    import { goto } from '$app/navigation';
    import fetchApi from '$lib/utils';
    import type { ModelResponse, RepositoryResponse } from '@code-review/types';
    import FormField from '../molecule/FormField.svelte';
    import ToggleButton from '../atom/ToggleButton.svelte';
    import { siForgejo, siGitea, siGithub, siGitlab } from 'simple-icons';
    import Card from '../layout/Card.svelte';
    import Button from '../atom/Button.svelte';
    import { openAlert, openConfirm } from '$lib/store/modal';
    import Description from '../atom/Description.svelte';

    type ReplyThreadPolicy = 'all' | 'mentioned_only' | 'off';

    type InitialData = Pick<
        RepositoryResponse,
        | 'name'
        | 'provider'
        | 'baseUrl'
        | 'botUsername'
        | 'language'
        | 'gitlabRepositoryId'
        | 'githubRepositoryPath'
        | 'modelId'
        | 'reviewOnMergeRequestOpen'
        | 'commentOnIssueOpen'
        | 'replyToMergeRequestComment'
        | 'replyToIssueComment'
        | 'inlineReview'
    > & {
        apiToken?: string;
        webhookSecret?: string;
    };

    interface Props {
        mode: 'create' | 'edit';
        repositoryId?: number;
        provider?: 'gitlab' | 'github' | 'gitea' | 'forgejo';
        modelList: ModelResponse[];
        initialData?: InitialData;
    }

    let { mode, repositoryId, provider, modelList, initialData }: Props = $props();

    let name = $state(initialData?.name ?? '');
    let baseUrl = $state(initialData?.baseUrl ?? '');
    let apiToken = $state(initialData?.apiToken ?? '');
    let webhookSecret = $state(initialData?.webhookSecret ?? '');
    let botUsername = $state(initialData?.botUsername ?? '');
    let language = $state(initialData?.language ?? 'English');
    let gitlabRepositoryId = $state(initialData?.gitlabRepositoryId?.toString() ?? '');
    let githubRepositoryPath = $state(initialData?.githubRepositoryPath ?? '');
    let modelId = $state(initialData?.modelId?.toString() ?? '');

    let reviewOnMergeRequestOpen = $state(initialData?.reviewOnMergeRequestOpen ?? true);
    let commentOnIssueOpen = $state(initialData?.commentOnIssueOpen ?? true);
    let replyToMergeRequestComment = $state<ReplyThreadPolicy>(
        initialData?.replyToMergeRequestComment ?? 'all'
    );
    let replyToIssueComment = $state<ReplyThreadPolicy>(initialData?.replyToIssueComment ?? 'all');
    let inlineReview = $state(initialData?.inlineReview ?? true);

    const providerOptionList = [
        { label: 'GitLab', value: 'gitlab' as const, icon: siGitlab },
        { label: 'GitHub', value: 'github' as const, icon: siGithub },
        { label: 'Gitea', value: 'gitea' as const, icon: siGitea },
        { label: 'Forgejo', value: 'forgejo' as const, icon: siForgejo }
    ].filter((item) => item.value === provider || item.value === initialData?.provider);

    const replyToMergeRequestCommentOptionList: {
        label: string;
        value: ReplyThreadPolicy;
        description: string;
    }[] = [
        {
            label: 'All',
            value: 'all',
            description: 'Reply on all thread comments on merge requests'
        },
        {
            label: 'Mentioned only',
            value: 'mentioned_only',
            description: 'Reply only when the bot is @mentioned in MR discussion threads'
        },
        {
            label: 'Off',
            value: 'off',
            description: 'Do not reply to merge request comments'
        }
    ];

    const replyToIssueCommentOptionList: {
        label: string;
        value: ReplyThreadPolicy;
        description: string;
    }[] = [
        {
            label: 'All',
            value: 'all',
            description: 'Reply on all thread comments on issues'
        },
        {
            label: 'Mentioned only',
            value: 'mentioned_only',
            description: 'Reply only when the bot is @mentioned in issue discussion threads'
        },
        {
            label: 'Off',
            value: 'off',
            description: 'Do not reply to issue comments'
        }
    ];

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
                language,
                gitlabRepositoryId: gitlabRepositoryId ? parseInt(gitlabRepositoryId, 10) : null,
                githubRepositoryPath: githubRepositoryPath || null,
                modelId: modelId ? parseInt(modelId, 10) : null,
                reviewOnMergeRequestOpen,
                commentOnIssueOpen,
                replyToMergeRequestComment,
                replyToIssueComment,
                inlineReview
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
                language,
                gitlabRepositoryId: gitlabRepositoryId ? parseInt(gitlabRepositoryId, 10) : null,
                githubRepositoryPath: githubRepositoryPath || null,
                modelId: modelId ? parseInt(modelId, 10) : null,
                reviewOnMergeRequestOpen,
                commentOnIssueOpen,
                replyToMergeRequestComment,
                replyToIssueComment,
                inlineReview
            };

            await fetchApi(`/repository/${repositoryId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
        }

        goto('/repository');
    }

    async function removeRepository(rid: number) {
        const confirmed = await openConfirm('Are you sure you want to remove this repository?');
        if (!confirmed) return;
        await fetchApi(`/repository/${rid}`, {
            method: 'DELETE'
        });
        await openAlert('Repository removed successfully');
        goto('/repository');
    }
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
                description="The provider of the repository (GitLab, GitHub, Gitea, or Forgejo)"
                upper
                linkLabelToControl={false}
            >
                {#snippet children({ id: _id })}
                    <div class="flex h-36 gap-2" id={_id} role="group">
                        {#each providerOptionList as item}
                            <ToggleButton
                                label={item.label}
                                selected={provider === item.value}
                                onclick={() => (provider = item.value)}
                                icon={item.icon}
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
                <FormField label="GitLab Repository ID" description="ID of the GitLab project">
                    {#snippet children({ id })}
                        <InputText {id} placeholder="12345" bind:value={gitlabRepositoryId} />
                    {/snippet}
                </FormField>
            </div>
        {/if}
        {#if provider === 'github'}
            <div>
                <FormField
                    label="GitHub repository path"
                    description="e.g. owner/repo (if not using the GitHub App flow only)"
                >
                    {#snippet children({ id })}
                        <InputText
                            {id}
                            placeholder="acme/cool-app"
                            bind:value={githubRepositoryPath}
                        />
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
    <Card title="Merge request" spaceY>
        <div>
            <FormField
                label="Review on merge request open"
                description="Run a code review when a merge request is opened or updated"
            >
                {#snippet children({ id })}
                    <input
                        {id}
                        type="checkbox"
                        bind:checked={reviewOnMergeRequestOpen}
                        class="h-5 w-5 rounded border-neutral-200"
                    />
                {/snippet}
            </FormField>
        </div>
        <div>
            <FormField
                label="Inline review"
                description="Post findings on specific diff lines when supported, instead of summary-only"
            >
                {#snippet children({ id })}
                    <div class="flex items-center gap-2">
                        <input
                            {id}
                            type="checkbox"
                            bind:checked={inlineReview}
                            class="h-5 w-5 rounded border-neutral-200"
                        />
                        <span class="text-sm text-neutral-600 dark:text-neutral-400">Enabled</span>
                    </div>
                {/snippet}
            </FormField>
        </div>
        <div>
            <FormField
                label="Reply to merge request comments"
                description="How the bot responds in MR discussion threads"
                linkLabelToControl={false}
            >
                {#snippet children({ id: _id })}
                    <div class="flex min-h-36 flex-wrap gap-2" id={_id} role="group">
                        {#each replyToMergeRequestCommentOptionList as opt}
                            <ToggleButton
                                label={opt.label}
                                description={opt.description}
                                selected={replyToMergeRequestComment === opt.value}
                                onclick={() => (replyToMergeRequestComment = opt.value)}
                                class="min-w-[7rem] flex-1"
                            />
                        {/each}
                    </div>
                {/snippet}
            </FormField>
        </div>
    </Card>
    <Card title="Issue" spaceY>
        <div>
            <FormField
                label="Comment on issue open"
                description="Open a thread when a new issue is created (provider-dependent)"
            >
                {#snippet children({ id })}
                    <input
                        {id}
                        type="checkbox"
                        bind:checked={commentOnIssueOpen}
                        class="h-5 w-5 rounded border-neutral-200"
                    />
                {/snippet}
            </FormField>
        </div>
        <div>
            <FormField
                label="Reply to issue comments"
                description="How the bot responds in issue discussion threads"
                linkLabelToControl={false}
            >
                {#snippet children({ id: _id })}
                    <div class="flex min-h-36 flex-wrap gap-2" id={_id} role="group">
                        {#each replyToIssueCommentOptionList as opt}
                            <ToggleButton
                                label={opt.label}
                                description={opt.description}
                                selected={replyToIssueComment === opt.value}
                                onclick={() => (replyToIssueComment = opt.value)}
                                class="min-w-[7rem] flex-1"
                            />
                        {/each}
                    </div>
                {/snippet}
            </FormField>
        </div>
    </Card>
    <Card title="Bot" spaceY>
        <div>
            <FormField
                label="Bot username (optional)"
                description="If set, used for @mention matching and display"
            >
                {#snippet children({ id })}
                    <InputText {id} placeholder="code-review-bot" bind:value={botUsername} />
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
