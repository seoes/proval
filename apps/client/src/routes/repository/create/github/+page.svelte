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
    import type { PageProps } from './$types';

    type GithubAppRow = { id: number; appId: number; slug: string };
    type InstallationRow = { id: number; account: string; type: string };
    type RepoRow = { id: number; fullName: string; private: boolean; alreadyConnected: boolean };
    type ReplyMode = 'all' | 'mentioned_only' | 'off';

    let { data }: PageProps = $props();

    let appList = $state<GithubAppRow[]>([...data.appList]);
    let step = $state(1);
    let regMode = $state<'quick' | 'manual'>('quick');
    let isCreatingApp = $state(false);
    let isFetching = $state(false);

    let selectedAppId = $state('');
    let webhookUrl = $state('');

    let installationList = $state<InstallationRow[]>([]);
    let selectedInstallationId = $state('');

    let repoList = $state<RepoRow[]>([]);
    let repoSearch = $state('');
    let selectedRepoPath = $state('');
    let selectedGithubRepoId = $state(0);

    let manualAppId = $state('');
    let manualSlug = $state('');
    let manualPrivateKey = $state('');
    let manualWebhookSecret = $state('');

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

    async function refreshAppList() {
        const res = await fetchApi('/github/app');
        if (!res.ok) {
            await openAlert('Failed to load GitHub Apps');
            return;
        }
        appList = await res.json();
    }

    function normalizeBaseUrl(raw: string): string {
        const u = raw.trim().replace(/\/$/, '');
        try {
            new URL(u);
            return u;
        } catch {
            throw new Error('Invalid webhook URL');
        }
    }

    function postManifestToGitHub() {
        const normalizedWebhookUrl = normalizeBaseUrl(webhookUrl);

        const clientUrl = window.location.origin;
        const callbackUrl = `${clientUrl}/repository/create/github/app/callback`;
        const setupUrl = `${clientUrl}/repository/create/github/app/setup`;

        const manifest = {
            name: `Proval-${crypto.randomUUID().replace(/-/g, '').slice(0, 6)}`,
            url: normalizedWebhookUrl,
            hook_attributes: {
                url: `${normalizedWebhookUrl}/webhook/github`,
                active: true
            },
            redirect_url: callbackUrl,
            setup_url: setupUrl,
            public: false,
            default_permissions: {
                contents: 'read',
                metadata: 'read',
                pull_requests: 'write',
                issues: 'write',
                statuses: 'write'
            },
            default_events: ['pull_request', 'issue_comment']
        };

        const form = document.createElement('form');
        form.method = 'POST';
        form.action = 'https://github.com/settings/apps/new';

        const manifestInput = document.createElement('input');
        manifestInput.type = 'hidden';
        manifestInput.name = 'manifest';
        manifestInput.value = JSON.stringify(manifest);

        const stateInput = document.createElement('input');
        stateInput.type = 'hidden';
        stateInput.name = 'state';
        stateInput.value = crypto.randomUUID();

        form.append(manifestInput, stateInput);
        document.body.appendChild(form);
        form.submit();
        form.remove();
    }

    async function createApp() {
        try {
            isCreatingApp = true;
            postManifestToGitHub();
            await openAlert('Complete GitHub App creation in the new tab, then return here.');
        } catch (e) {
            await openAlert(e instanceof Error ? e.message : 'Invalid URL');
        } finally {
            isCreatingApp = false;
        }
    }

    async function registerManualApp() {
        const appId = parseInt(manualAppId, 10);
        if (
            !Number.isFinite(appId) ||
            !manualSlug.trim() ||
            !manualPrivateKey.trim() ||
            !manualWebhookSecret.trim()
        ) {
            await openAlert('Fill in App ID, slug, private key, and webhook secret');
            return;
        }
        isFetching = true;
        try {
            const res = await fetchApi('/github/app', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    appId,
                    slug: manualSlug.trim(),
                    privateKey: manualPrivateKey,
                    webhookSecret: manualWebhookSecret.trim()
                })
            });
            const body = (await res.json()) as { error?: string };
            if (!res.ok) {
                await openAlert(body.error ?? 'Registration failed');
                return;
            }
            await openAlert('GitHub App saved. You can select it below.');
            manualPrivateKey = '';
            manualWebhookSecret = '';
            await refreshAppList();
            regMode = 'quick';
        } finally {
            isFetching = false;
        }
    }

    function openInstallPage() {
        const app = appList.find((a) => a.id.toString() === selectedAppId);
        const slug = app?.slug;
        if (!slug) return;
        window.open(
            `https://github.com/apps/${slug}/installations/new`,
            '_blank',
            'noopener,noreferrer'
        );
    }

    async function continueToInstallations() {
        if (!selectedAppId) return;
        isFetching = true;
        try {
            const res = await fetchApi(`/github/app/${selectedAppId}/installation`);
            if (!res.ok) {
                await openAlert('Could not load installations');
                return;
            }
            installationList = await res.json();
            selectedInstallationId = '';
            step = 2;
        } finally {
            isFetching = false;
        }
    }

    async function continueToRepositories() {
        if (!selectedAppId || !selectedInstallationId) return;
        isFetching = true;
        try {
            const res = await fetchApi(
                `/github/app/${selectedAppId}/installation/${selectedInstallationId}/repository`
            );
            if (!res.ok) {
                await openAlert('Could not load repositories');
                return;
            }
            repoList = await res.json();
            selectedRepoPath = '';
            selectedGithubRepoId = 0;
            repoSearch = '';
            step = 3;
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
        step = 4;
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
        if (
            !selectedAppId ||
            !selectedInstallationId ||
            !selectedRepoPath ||
            !selectedGithubRepoId
        ) {
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
                webhookSecret: null,
                botUsername: null,
                language,
                githubAppId: parseInt(selectedAppId, 10),
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
            {#each [1, 2, 3, 4] as s}
                <div class="flex items-center">
                    <div
                        class="flex h-8 w-8 items-center justify-center rounded-full {step >= s
                            ? 'bg-primary text-white'
                            : 'bg-neutral-200 text-neutral-500 dark:bg-neutral-700'}"
                    >
                        {s}
                    </div>
                    {#if s < 4}
                        <div
                            class="h-0.5 w-8 {step > s
                                ? 'bg-primary'
                                : 'bg-neutral-200 dark:bg-neutral-700'}"
                        ></div>
                    {/if}
                </div>
            {/each}
        </div>

        {#if step === 1}
            <Card title="Step 1: GitHub App">
                <div class="mb-4 flex flex-wrap gap-2">
                    <ToggleButton
                        label="Quick setup"
                        description="Create via GitHub manifest"
                        selected={regMode === 'quick'}
                        onclick={() => (regMode = 'quick')}
                        class="min-w-36 flex-1"
                    />
                    <ToggleButton
                        label="Existing app"
                        description="Paste credentials from GitHub"
                        selected={regMode === 'manual'}
                        onclick={() => (regMode = 'manual')}
                        class="min-w-36 flex-1"
                    />
                </div>

                {#if regMode === 'manual'}
                    <div class="space-y-4">
                        <FormField
                            label="App ID"
                            description="Numeric App ID from GitHub App settings"
                        >
                            {#snippet children({ id })}
                                <InputText {id} placeholder="123456" bind:value={manualAppId} />
                            {/snippet}
                        </FormField>
                        <FormField label="Slug" description="Short name of your GitHub App">
                            {#snippet children({ id })}
                                <InputText
                                    {id}
                                    placeholder="my-proval-app"
                                    bind:value={manualSlug}
                                />
                            {/snippet}
                        </FormField>
                        <FormField
                            label="Private key (PEM)"
                            description="Generate from App settings"
                        >
                            {#snippet children({ id })}
                                <textarea
                                    {id}
                                    bind:value={manualPrivateKey}
                                    rows="6"
                                    class="mt-1 w-full rounded-xl border border-neutral-200 bg-gray-50 px-4 py-2 font-mono text-sm outline-none dark:border-neutral-700 dark:bg-neutral-800"
                                    placeholder="-----BEGIN RSA PRIVATE KEY-----"
                                ></textarea>
                            {/snippet}
                        </FormField>
                        <FormField
                            label="Webhook secret"
                            description="From App settings — must match what GitHub sends"
                        >
                            {#snippet children({ id })}
                                <InputText {id} bind:value={manualWebhookSecret} password />
                            {/snippet}
                        </FormField>
                        <Button primary onclick={registerManualApp} disabled={isFetching}>
                            {isFetching ? 'Saving...' : 'Save GitHub App'}
                        </Button>
                    </div>
                {:else if !appList.length || isCreatingApp}
                    <div class="space-y-4">
                        <FormField
                            label="Public webhook base URL"
                            description="Must be reachable by GitHub (often your tunnel to port 7901), e.g. https://hooks.example.com:7901 — webhook path /webhook/github is appended automatically."
                        >
                            {#snippet children({ id })}
                                <InputText
                                    {id}
                                    placeholder="https://your-public-host:7901"
                                    bind:value={webhookUrl}
                                />
                            {/snippet}
                        </FormField>
                        <Button primary onclick={createApp} disabled={!webhookUrl}>
                            Connect GitHub App
                        </Button>
                        <p class="text-sm text-neutral-500">
                            Opens GitHub to register the app. Callback and setup URLs use this
                            browser origin (<code
                                class="rounded bg-neutral-100 px-1 dark:bg-neutral-800"
                                >{typeof window !== 'undefined' ? window.location.origin : ''}</code
                            >), so private networks work for those steps.
                        </p>
                    </div>
                {:else}
                    <div class="space-y-4">
                        <FormField
                            label="Select app"
                            description="Choose a registered GitHub App"
                            linkLabelToControl={false}
                        >
                            {#snippet children({ id: _id })}
                                <div class="mt-3 flex flex-wrap gap-2" id={_id} role="group">
                                    {#each appList as app}
                                        <button
                                            type="button"
                                            class="min-w-32 rounded-lg border p-3 text-left transition-colors {selectedAppId ===
                                            app.id.toString()
                                                ? 'border-primary bg-primary/10'
                                                : 'border-neutral-200 hover:border-neutral-300 dark:border-neutral-700'}"
                                            onclick={() => (selectedAppId = app.id.toString())}
                                        >
                                            <div class="font-medium">{app.slug}</div>
                                            <div class="text-sm text-neutral-500">
                                                App #{app.appId}
                                            </div>
                                        </button>
                                    {/each}
                                </div>
                            {/snippet}
                        </FormField>
                        <div class="flex flex-wrap gap-2">
                            <Button
                                primary
                                onclick={continueToInstallations}
                                disabled={!selectedAppId || isFetching}
                            >
                                {isFetching ? 'Loading...' : 'Continue'}
                            </Button>
                            <Button text onclick={() => (isCreatingApp = true)}
                                >Create new app</Button
                            >
                            <Button text onclick={refreshAppList}>Refresh list</Button>
                        </div>
                    </div>
                {/if}
            </Card>
        {/if}

        {#if step === 2}
            <Card title="Step 2: Installation">
                {#if installationList.length === 0}
                    <div class="space-y-4">
                        <p class="text-neutral-500">No installations found for this app.</p>
                        <Button primary onclick={openInstallPage}>Install app on GitHub</Button>
                        <Button text onclick={continueToInstallations} disabled={isFetching}>
                            Refresh installations
                        </Button>
                    </div>
                {:else}
                    <div class="space-y-4">
                        <FormField
                            label="Installation"
                            description="Account or organization where the app is installed"
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
                                                (selectedInstallationId =
                                                    installation.id.toString())}
                                        >
                                            <div class="font-medium">{installation.account}</div>
                                            <div class="text-sm text-neutral-500">
                                                {installation.type}
                                            </div>
                                        </button>
                                    {/each}
                                </div>
                            {/snippet}
                        </FormField>
                        <div class="flex flex-wrap gap-2">
                            <Button
                                primary
                                onclick={continueToRepositories}
                                disabled={!selectedInstallationId || isFetching}
                            >
                                {isFetching ? 'Loading...' : 'Continue'}
                            </Button>
                            <Button text onclick={openInstallPage}
                                >Install on another account</Button
                            >
                        </div>
                    </div>
                {/if}
            </Card>
        {/if}

        {#if step === 3}
            <Card title="Step 3: Repository">
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

        {#if step === 4}
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
