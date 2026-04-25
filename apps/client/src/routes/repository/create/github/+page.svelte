<script lang="ts">
    import DefaultLayout from '$lib/components/layout/DefaultLayout.svelte';
    import InputText from '$lib/components/atom/InputText.svelte';
    import FormField from '$lib/components/molecule/FormField.svelte';
    import ToggleButton from '$lib/components/atom/ToggleButton.svelte';
    import Card from '$lib/components/layout/Card.svelte';
    import Button from '$lib/components/atom/Button.svelte';
    import { goto } from '$app/navigation';
    import { openAlert, openConfirm } from '$lib/store/modal';
    import type { PageProps } from './$types';

    let { data }: PageProps = $props();

    // State
    let step = $state(1);
    let isLoading = $state(false);
    let isCreatingApp = $state(false);

    // Step 1: App selection
    let selectedAppId = $state<string>('');
    let webhookUrl = $state('');

    // Step 2: Installation selection
    let selectedInstallationId = $state<string>('');

    // Step 3: Repository selection
    let selectedRepoPath = $state('');

    // Step 4: Common settings
    let name = $state('');
    let modelId = $state('');
    let language = $state('English');
    let reviewMode = $state<'off' | 'assigned_only'>('off');
    let replyMode = $state<'off' | 'assigned_only' | 'mentioned_only'>('off');
    let autoAssign = $state(false);
    let allowApproval = $state(false);

    function handleAppSelect(appId: string) {
        selectedAppId = appId;
        step = 2;
    }

    function handleInstallationSelect(installationId: string) {
        selectedInstallationId = installationId;
        step = 3;
    }

    function handleRepoSelect(repoPath: string) {
        selectedRepoPath = repoPath;
        name = repoPath.split('/')[1] || repoPath;
        step = 4;
    }

    function normalizeBaseUrl(raw: string): string {
        const u = raw.trim().replace(/\/$/, '');
        try {
            new URL(u);
            return u;
        } catch {
            throw new Error('Invalid instance URL');
        }
    }

    async function createApp() {
        isCreatingApp = true;

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
        form.rel = 'noopener noreferrer';

        const manifestInput = document.createElement('input');
        manifestInput.type = 'hidden';
        manifestInput.name = 'manifest';
        manifestInput.value = JSON.stringify(manifest);
        form.appendChild(manifestInput);

        const stateInput = document.createElement('input');
        stateInput.type = 'hidden';
        stateInput.name = 'state';
        stateInput.value = crypto.randomUUID();
        form.appendChild(stateInput);

        form.append(manifestInput, stateInput);
        document.body.appendChild(form);
        form.submit();
        form.remove();

        await openAlert('GitHub App registration opened in a new tab.');
        isLoading = false;
    }

    async function installApp() {
        const app = data.appList.find((a) => a.id.toString() === selectedAppId);
        if (!app) return;
        // TODO: 실제 installation 링크
        await openAlert('Complete the installation in the opened tab.');
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

        const confirm = await openConfirm('Create this repository?');
        if (!confirm) return;

        // TODO: 실제 저장 로직
        console.log('Creating repository:', {
            name,
            provider: 'github',
            githubRepositoryPath: selectedRepoPath,
            githubInstallationId: selectedInstallationId,
            modelId,
            language,
            reviewMode,
            replyMode,
            autoAssign,
            allowApproval
        });

        goto('/repository');
    }

    const reviewModeOptions: {
        label: string;
        value: 'off' | 'assigned_only';
        description: string;
    }[] = [
        {
            label: 'Assigned Only',
            value: 'assigned_only',
            description: 'Bot will only review assigned Pull Requests'
        },
        { label: 'Off', value: 'off', description: 'Bot will not review any Pull Requests' }
    ];

    const replyModeOptions: {
        label: string;
        value: 'off' | 'assigned_only' | 'mentioned_only';
        description: string;
    }[] = [
        {
            label: 'Assigned Only',
            value: 'assigned_only',
            description: 'Bot will reply to comments in assigned PRs only'
        },
        {
            label: 'Mentioned Only',
            value: 'mentioned_only',
            description: 'Bot will reply when mentioned'
        },
        { label: 'Off', value: 'off', description: 'Bot will not reply to any comments' }
    ];
</script>

<DefaultLayout narrow title="Create GitHub Repository">
    <div class="space-y-6">
        <!-- Progress indicator -->
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

        <!-- Step 1: App selection -->
        {#if step === 1}
            <Card title="Step 1: GitHub App">
                {#if !data.appList || data.appList.length === 0 || isCreatingApp}
                    <div class="space-y-4">
                        <div>
                            <!-- <InputText
                                label="Instance URL"
                                description="External URL of current service. Webhook will be sent to this URL from GitHub."
                                placeholder="https://your-domain.com"
                                bind:value={instanceUrl}
                            /> -->
                            <FormField
                                label="Webhook URL"
                                description="Webhook will be sent to this URL from GitHub. HTTPS is required."
                            >
                                {#snippet children({ id })}
                                    <InputText
                                        {id}
                                        placeholder="https://your-domain.com/"
                                        bind:value={webhookUrl}
                                    />
                                {/snippet}
                            </FormField>
                        </div>

                        <div>
                            <Button primary onclick={createApp} disabled={isLoading || !webhookUrl}>
                                {isCreatingApp ? 'Loading...' : 'Connect GitHub App'}
                            </Button>
                        </div>
                        <p class="text-sm text-neutral-500">
                            This will open GitHub to create a new App.
                        </p>
                    </div>
                {:else}
                    <div class="space-y-4">
                        <div>
                            <FormField
                                label="Select App"
                                description="Choose an existing GitHub App or create a new one"
                                linkLabelToControl={false}
                            >
                                {#snippet children({ id: _id })}
                                    <div
                                        class="mt-3 flex flex-wrap gap-2"
                                        id={_id}
                                        role="group"
                                    >
                                {#each data.appList as app}
                                    <button
                                        type="button"
                                        class="min-w-32 rounded-lg border p-3 text-left transition-colors {selectedAppId ===
                                        app.id.toString()
                                            ? 'border-primary bg-primary/10'
                                            : 'border-neutral-200 hover:border-neutral-300 dark:border-neutral-700'}"
                                        onclick={() => (selectedAppId = app.id.toString())}
                                    >
                                        <div class="font-medium">{app.slug}</div>
                                        <div class="text-sm text-neutral-500">@{app.owner}</div>
                                    </button>
                                {/each}
                                    </div>
                                {/snippet}
                            </FormField>
                        </div>

                        <div class="flex gap-2">
                            <Button
                                primary
                                onclick={() => handleAppSelect(selectedAppId)}
                                disabled={!selectedAppId}
                            >
                                Continue
                            </Button>
                            <Button text onclick={() => (isCreatingApp = true)}
                                >Create New App</Button
                            >
                        </div>
                    </div>
                {/if}
            </Card>
        {/if}

        <!-- Step 2: Installation selection -->
        {#if step === 2}
            <Card title="Step 2: Installation">
                {#if data.installationList.length === 0}
                    <div class="space-y-4">
                        <p class="text-neutral-500">No installations found for this app.</p>
                        <Button primary onclick={installApp}>Install App to Account/Org</Button>
                    </div>
                {:else}
                    <div class="space-y-4">
                        <div>
                            <FormField
                                label="Select Installation"
                                description="Choose where the app is installed"
                                linkLabelToControl={false}
                            >
                                {#snippet children({ id: _id })}
                                    <div
                                        class="mt-3 flex flex-wrap gap-2"
                                        id={_id}
                                        role="group"
                                    >
                                {#each data.installationList as installation}
                                    <button
                                        type="button"
                                        class="min-w-32 rounded-lg border p-3 text-left transition-colors {selectedInstallationId ===
                                        installation.id.toString()
                                            ? 'border-primary bg-primary/10'
                                            : 'border-neutral-200 hover:border-neutral-300 dark:border-neutral-700'}"
                                        onclick={() =>
                                            (selectedInstallationId = installation.id.toString())}
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
                        </div>

                        <div class="flex gap-2">
                            <Button
                                primary
                                onclick={() => handleInstallationSelect(selectedInstallationId)}
                                disabled={!selectedInstallationId}
                            >
                                Continue
                            </Button>
                            <Button text onclick={installApp}>Install to Another Account</Button>
                        </div>
                    </div>
                {/if}
            </Card>
        {/if}

        <!-- Step 3: Repository selection -->
        {#if step === 3}
            <Card title="Step 3: Repository">
                {#if data.repoList.length === 0}
                    <p class="text-neutral-500">No repositories accessible.</p>
                {:else}
                    <div class="space-y-4">
                        <div>
                            <FormField
                                label="Select Repository"
                                description="Choose the repository to connect"
                            >
                                {#snippet children({ id })}
                                    <select
                                        {id}
                                        class="h-10 w-full rounded-xl border border-neutral-200 bg-gray-50 px-4 text-sm outline-none dark:border-neutral-700 dark:bg-neutral-800"
                                        bind:value={selectedRepoPath}
                                    >
                                        <option value="">Select a repository</option>
                                        {#each data.repoList as repo}
                                            <option value={repo.fullName}>{repo.fullName}</option>
                                        {/each}
                                    </select>
                                {/snippet}
                            </FormField>
                        </div>

                        <div>
                            <Button
                                primary
                                onclick={() => handleRepoSelect(selectedRepoPath)}
                                disabled={!selectedRepoPath}
                            >
                                Continue
                            </Button>
                        </div>
                    </div>
                {/if}
            </Card>
        {/if}

        <!-- Step 4: Common settings -->
        {#if step === 4}
            <form onsubmit={handleSubmit} class="space-y-6">
                <Card>
                    <div class="space-y-4">
                        <div>
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
                        </div>
                        <div>
                            <FormField
                                label="Name"
                                description="Display name for this repository"
                            >
                                {#snippet children({ id })}
                                    <InputText {id} placeholder="My Project" bind:value={name} />
                                {/snippet}
                            </FormField>
                        </div>
                        <div>
                            <FormField
                                label="Model"
                                description="Select the model to use for code review"
                            >
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
                        </div>
                        <div>
                            <FormField
                                label="Language"
                                description="Default language for code review"
                            >
                                {#snippet children({ id })}
                                    <InputText {id} placeholder="English" bind:value={language} />
                                {/snippet}
                            </FormField>
                        </div>
                    </div>
                </Card>

                <Card title="Pull Request Settings">
                    <div class="space-y-4">
                        <div class="flex items-center justify-between gap-2">
                            <FormField
                                class="min-w-0 flex-1 pr-2"
                                label="Assign to Every New Pull Request"
                                description="Automatically assign reviewers"
                                linkLabelToControl={false}
                            />
                            <input
                                type="checkbox"
                                bind:checked={autoAssign}
                                class="h-5 w-5 shrink-0 rounded border-neutral-200"
                            />
                        </div>
                        <div class="flex items-center justify-between gap-2">
                            <FormField
                                class="min-w-0 flex-1 pr-2"
                                label="Allow Approve / Reject"
                                description="Bot can autonomously approve/reject"
                                linkLabelToControl={false}
                            />
                            <input
                                type="checkbox"
                                bind:checked={allowApproval}
                                class="h-5 w-5 shrink-0 rounded border-neutral-200"
                            />
                        </div>
                        <div>
                            <FormField
                                label="Review Mode"
                                description="When should the bot review?"
                                linkLabelToControl={false}
                            >
                                {#snippet children({ id: _id })}
                                    <div class="mt-3 flex gap-2" id={_id} role="group">
                                        {#each reviewModeOptions as option}
                                            <ToggleButton
                                                label={option.label}
                                                description={option.description}
                                                selected={reviewMode === option.value}
                                                onclick={() => (reviewMode = option.value)}
                                                class="flex-1"
                                            />
                                        {/each}
                                    </div>
                                {/snippet}
                            </FormField>
                        </div>
                        <div>
                            <FormField
                                label="Reply Mode"
                                description="When should the bot reply?"
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
                                                class="flex-1"
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
                    <Button text onclick={() => goto('/repository')}>Cancel</Button>
                </div>
            </form>
        {/if}
    </div>
</DefaultLayout>
