
<script lang="ts">
    import DefaultLayout from '$lib/components/layout/DefaultLayout.svelte';
    import Card from '$lib/components/layout/Card.svelte';
    import Button from '$lib/components/atom/Button.svelte';
    import InputText from '$lib/components/atom/InputText.svelte';
    import FormField from '$lib/components/molecule/FormField.svelte';
    import ToggleButton from '$lib/components/atom/ToggleButton.svelte';
    import Select from '$lib/components/atom/Select.svelte';
    import Modal from '$lib/components/atom/Modal.svelte';
    import {
        TrashIcon,
        TestTubeIcon,
        PlusIcon,
        GitlabLogoIcon,
        GithubLogoIcon,
        GitForkIcon,

        PencilIcon

    } from 'phosphor-svelte';
    import fetchApi from '$lib/utils';
    import PatchSecret from '$lib/components/molecule/PatchSecret.svelte';
    import { openAlert, openConfirm } from '$lib/store/modal';
    import type { PageProps } from './$types';

    type Installation = {
        id: number;
        installationId: number;
        accountName: string;
        accountType: 'User' | 'Organization';
    };

    type AccessItem = {
        id: number;
        provider: 'gitlab' | 'forgejo';
        name: string;
        baseUrl: string;
        botUsername: string | null;
        createdAt: string;
        updatedAt: string;
    };

    let { data }: PageProps = $props();

    // GitHub states
    let isDeletingApp = $state(false);
    let isAddingInstallation = $state(false);
    let regMode = $state<'quick' | 'manual'>('quick');
    let isCreatingApp = $state(false);
    let webhookUrl = $state('');
    let manualAppId = $state('');
    let manualSlug = $state('');
    let manualPrivateKey = $state('');
    let manualWebhookSecret = $state('');

    // Access states
    let accessList = $state<AccessItem[]>(data.accessList);
    let showModal = $state(false);
    let editingId = $state<number | null>(null);
    let isSavingAccess = $state(false);
    let isTestingId = $state<number | null>(null);
    let testResult = $state<{ id: number; success: boolean; message: string } | null>(null);

    let formProvider = $state<'gitlab' | 'forgejo'>('gitlab');
    let formName = $state('');
    let formBaseUrl = $state('');
    let formAccessToken = $state('');
    let formBotUsername = $state('');

    let updateAccessTokenModalOpen = $state(false);
    let selectedAccessId = $state<number | null>(null);
    let selectedAccessProvider = $state<'gitlab' | 'forgejo' | null>(null);

    const accessFormNamePlaceholder = $derived(
        formProvider === 'gitlab' ? 'Production GitLab' : 'Team Forgejo'
    );
    const accessFormBaseUrlPlaceholder = $derived(
        formProvider === 'gitlab'
            ? 'https://gitlab.example.com'
            : 'https://forgejo.example.com'
    );
    const accessFormTokenPlaceholder = $derived(
        formProvider === 'gitlab' ? 'glpat-xxxxxxxxxxxxxxxxxxxx' : 'Forgejo personal access token'
    );
    const accessFormTokenDescription = $derived(
        formProvider === 'gitlab'
            ? 'Personal or project token with api scope'
            : 'Personal access token with API scope (e.g. read_api, write_repository)'
    );
    const accessFormBaseUrlDescription = $derived(
        formProvider === 'gitlab'
            ? 'Root URL of your GitLab instance'
            : 'Root URL of your Forgejo instance'
    );
    const accessFormBotPlaceholder = $derived(
        formProvider === 'gitlab' ? 'project_123_bot_abcd1234' : 'Optional bot username for mentions'
    );

    // GitHub functions (unchanged logic)
    async function deleteApp() {
        if (!data.app) return;
        if (!(await openConfirm('Delete this GitHub App? All installations will be removed.'))) {
            return;
        }
        isDeletingApp = true;
        try {
            const res = await fetchApi('/github/app', { method: 'DELETE' });
            if (res.ok) {
                window.location.reload();
            } else {
                const err = await res.json();
                await openAlert(err.error || 'Failed to delete app');
            }
        } catch {
            await openAlert('Failed to delete app');
        } finally {
            isDeletingApp = false;
        }
    }

    async function deleteInstallation(installationId: number) {
        if (!data.app) return;
        if (
            !(await openConfirm('Delete this installation? This will also remove it from GitHub.'))
        ) {
            return;
        }
        try {
            const res = await fetchApi(
                `/github/app/${data.app.id}/installation/${installationId}`,
                { method: 'DELETE' }
            );
            if (res.ok) {
                window.location.reload();
            } else {
                const err = await res.json();
                await openAlert(err.error || 'Failed to delete installation');
            }
        } catch {
            await openAlert('Failed to delete installation');
        }
    }

    async function getInstallUrl() {
        if (!data.app) return;
        const newWindow = window.open('', '_blank');
        if (!newWindow) {
            await openAlert('Popup blocked. Please allow popups for this site.');
            return;
        }
        isAddingInstallation = true;
        try {
            const res = await fetchApi(`/github/app/${data.app.id}/install-url`);
            if (res.ok) {
                const { url } = await res.json();
                newWindow.location.href = url;
            } else {
                const err = await res.json();
                newWindow.close();
                await openAlert(err.error || 'Failed to get install URL');
            }
        } catch {
            newWindow.close();
            await openAlert('Failed to get install URL');
        } finally {
            isAddingInstallation = false;
        }
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
        const clientOrigin = window.location.origin;
        const manifest = {
            name: `Proval-${crypto.randomUUID().replace(/-/g, '').slice(0, 6)}`,
            url: normalizedWebhookUrl,
            hook_attributes: {
                url: `${normalizedWebhookUrl}/webhook/github`,
                active: true
            },
            redirect_url: `${clientOrigin}/repository/create/github/app/callback`,
            setup_url: `${clientOrigin}/repository/create/github/app/setup`,
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

    async function createAppQuick() {
        try {
            isCreatingApp = true;
            await openAlert(
                'Complete GitHub App creation in the new tab, then return here and refresh.'
            );
            postManifestToGitHub();
        } catch (e) {
            await openAlert(e instanceof Error ? e.message : 'Invalid URL');
        } finally {
            isCreatingApp = false;
        }
    }

    async function createAppManual() {
        const appId = parseInt(manualAppId, 10);
        if (
            !Number.isFinite(appId) ||
            !manualSlug.trim() ||
            !manualPrivateKey.trim() ||
            !manualWebhookSecret.trim()
        ) {
            await openAlert('Fill in all fields: App ID, slug, private key, and webhook secret');
            return;
        }
        isCreatingApp = true;
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
            const body = await res.json();
            if (!res.ok) {
                await openAlert(body.error ?? 'Registration failed');
                return;
            }
            window.location.reload();
        } catch {
            await openAlert('Failed to register app');
        } finally {
            isCreatingApp = false;
        }
    }

    // Access functions
    function openAddModal(provider: 'gitlab' | 'forgejo') {
        editingId = null;
        formProvider = provider;
        formName = '';
        formBaseUrl = '';
        formAccessToken = '';
        formBotUsername = '';
        testResult = null;
        showModal = true;
    }

    function openEditForm(item: AccessItem) {
        editingId = item.id;
        formProvider = item.provider;
        formName = item.name;
        formBaseUrl = item.baseUrl;
        formAccessToken = '';
        formBotUsername = item.botUsername ?? '';
        testResult = null;
        showModal = true;
    }

    function closeAccessModal() {
        showModal = false;
        editingId = null;
        testResult = null;
    }

    async function saveAccess() {
        if (!formName.trim() || !formBaseUrl.trim()) {
            await openAlert('Name and base URL are required');
            return;
        }
        if (editingId === null && !formAccessToken.trim()) {
            await openAlert('Access token is required');
            return;
        }
        isSavingAccess = true;
        try {
            if (editingId !== null) {
                const payload = {
                    name: formName.trim(),
                    baseUrl: formBaseUrl.trim(),
                    botUsername: formBotUsername.trim() || undefined
                };
                const res = await fetchApi(`/access/${editingId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                if (!res.ok) {
                    const body = await res.json().catch(() => ({}));
                    await openAlert(body.error || 'Failed to update access');
                    return;
                }
            } else {
                const payload = {
                    provider: formProvider,
                    name: formName.trim(),
                    baseUrl: formBaseUrl.trim(),
                    accessToken: formAccessToken,
                    botUsername: formBotUsername.trim() || undefined
                };
                const res = await fetchApi('/access', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                if (!res.ok) {
                    const body = await res.json().catch(() => ({}));
                    await openAlert(body.error || 'Failed to create access');
                    return;
                }
            }
            window.location.reload();
        } catch {
            await openAlert('Failed to save access');
        } finally {
            isSavingAccess = false;
        }
    }

    async function deleteAccess(id: number) {
        if (!(await openConfirm('Delete this access configuration? Repositories using it may break.'))) {
            return;
        }
        try {
            const res = await fetchApi(`/access/${id}`, { method: 'DELETE' });
            if (res.ok) {
                accessList = accessList.filter((a) => a.id !== id);
            } else {
                const body = await res.json().catch(() => ({}));
                await openAlert(body.error || 'Failed to delete access');
            }
        } catch {
            await openAlert('Failed to delete access');
        }
    }

    async function testAccess(id: number) {
        isTestingId = id;
        testResult = null;
        try {
            const res = await fetchApi(`/access/${id}/test`, { method: 'POST' });
            const body = await res.json().catch(() => ({ success: false, message: 'Unknown error' }));
            testResult = { id, success: body.success, message: body.message };
        } catch {
            testResult = { id, success: false, message: 'Request failed' };
        } finally {
            isTestingId = null;
        }
    }

    function modalTitle() {
        if (editingId !== null) return 'Edit Access';
        return formProvider === 'gitlab' ? 'Add GitLab Access' : 'Add Forgejo Access';
    }

    const gitlabList = $derived(accessList.filter((a) => a.provider === 'gitlab'));
    const forgejoList = $derived(accessList.filter((a) => a.provider === 'forgejo'));

    function openUpdateAccessTokenModal(item: AccessItem) {
        selectedAccessId = item.id;
        selectedAccessProvider = item.provider;
        updateAccessTokenModalOpen = true;
    }

    function closeUpdateAccessTokenModal() {
        updateAccessTokenModalOpen = false;
        selectedAccessId = null;
        selectedAccessProvider = null;
    }

    const patchSecretTokenPlaceholder = $derived(
        selectedAccessProvider === 'forgejo'
            ? 'Forgejo personal access token'
            : 'glpat-xxxxxxxxxxxxxxxxxxxx'
    );
    const patchSecretTokenDescription = $derived(
        selectedAccessProvider === 'forgejo'
            ? 'Personal access token with API scope (e.g. read_api, write_repository)'
            : 'Personal or project token with api scope'
    );
</script>

<DefaultLayout title="Git Provider">
    <div class="space-y-6">
        <!-- GitLab Access Card -->
        <Card title="GitLab Access" border>
            <div class="space-y-4">
                {#if gitlabList.length > 0}
                    <div class="divide-y divide-neutral-200 dark:divide-neutral-700">
                        {#each gitlabList as item (item.id)}
                            <div class="py-4 first:pt-0 last:pb-0">
                                <div class="flex items-start justify-between gap-3">
                                    <div class="flex items-center gap-3 min-w-0">
                                        <div
                                            class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-neutral-600"
                                        >
                                            <GitlabLogoIcon class="size-5" />
                                        </div>
                                        <div class="min-w-0">
                                            <div class="flex items-center gap-2">
                                                <p class="font-medium text-neutral-800 truncate">
                                                    {item.name}
                                                </p>
                                                <span
                                                    class="inline-flex items-center rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600 uppercase"
                                                >
                                                    {item.provider}
                                                </span>
                                            </div>
                                            <p class="text-sm text-neutral-500 truncate">
                                                {item.baseUrl}
                                            </p>
                                            {#if item.botUsername}
                                                <p class="text-xs text-neutral-400">
                                                    Bot: @{item.botUsername}
                                                </p>
                                            {/if}
                                        </div>
                                    </div>
                                    <div class="flex shrink-0 flex-wrap items-center justify-end gap-1">
                                        <button
                                            class="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-700 disabled:cursor-not-allowed disabled:opacity-50"
                                            onclick={() => testAccess(item.id)}
                                            disabled={isTestingId === item.id}
                                        >
                                            <TestTubeIcon class="size-3.5" />
                                            {isTestingId === item.id ? 'Testing...' : 'Test'}
                                        </button>
                                        <Button
                                            text
                                            onclick={() => openUpdateAccessTokenModal(item)}
                                            class="h-auto w-auto shrink-0 px-2 py-1.5 text-xs font-medium"
                                        >
                                            Update Access Token
                                        </Button>
                                        <button
                                            class="rounded p-1.5 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600"
                                            onclick={() => openEditForm(item)}
                                        >
                                            <PencilIcon class="size-4" />
                                        </button>
                                        <button
                                            class="rounded p-1.5 text-neutral-400 transition-colors hover:bg-red-50 hover:text-red-600"
                                            onclick={() => deleteAccess(item.id)}
                                        >
                                            <TrashIcon class="size-4" />
                                        </button>
                                    </div>
                                </div>
                                {#if testResult && testResult.id === item.id}
                                    <div
                                        class="mt-2 flex items-center gap-2 rounded-lg px-3 py-2 text-sm {testResult.success
                                            ? 'bg-emerald-50 text-emerald-700'
                                            : 'bg-red-50 text-red-700'}"
                                    >
                                        <span class="font-medium">{testResult.success ? 'Connected' : 'Failed'}:</span>
                                        {testResult.message}
                                    </div>
                                {/if}
                            </div>
                        {/each}
                    </div>
                {:else}
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-neutral-600">No GitLab access configurations</p>
                            <p class="mt-1 text-sm text-neutral-400">
                                Add a GitLab access token to connect repositories
                            </p>
                        </div>
                    </div>
                {/if}

                <div class="flex items-center gap-2">
                    <Button primary onclick={() => openAddModal('gitlab')} class="w-auto">
                        <span class="flex items-center gap-1.5">
                            <PlusIcon class="size-4" />
                            Add Access
                        </span>
                    </Button>
                </div>
            </div>
        </Card>

        <!-- Forgejo Access Card -->
        <!-- <Card title="Forgejo Access" border>
            <div class="space-y-4">
                {#if forgejoList.length > 0}
                    <div class="divide-y divide-neutral-200 dark:divide-neutral-700">
                        {#each forgejoList as item (item.id)}
                            <div class="py-4 first:pt-0 last:pb-0">
                                <div class="flex items-start justify-between gap-3">
                                    <div class="flex items-center gap-3 min-w-0">
                                        <div
                                            class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-neutral-600"
                                        >
                                            <GitForkIcon class="size-5" />
                                        </div>
                                        <div class="min-w-0">
                                            <div class="flex items-center gap-2">
                                                <p class="font-medium text-neutral-800 truncate">
                                                    {item.name}
                                                </p>
                                                <span
                                                    class="inline-flex items-center rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600 uppercase"
                                                >
                                                    {item.provider}
                                                </span>
                                            </div>
                                            <p class="text-sm text-neutral-500 truncate">
                                                {item.baseUrl}
                                            </p>
                                            {#if item.botUsername}
                                                <p class="text-xs text-neutral-400">
                                                    Bot: @{item.botUsername}
                                                </p>
                                            {/if}
                                        </div>
                                    </div>
                                    <div class="flex shrink-0 flex-wrap items-center justify-end gap-1">
                                        <button
                                            class="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-700 disabled:cursor-not-allowed disabled:opacity-50"
                                            onclick={() => testAccess(item.id)}
                                            disabled={isTestingId === item.id}
                                        >
                                            <TestTubeIcon class="size-3.5" />
                                            {isTestingId === item.id ? 'Testing...' : 'Test'}
                                        </button>
                                        <Button
                                            text
                                            onclick={() => openUpdateAccessTokenModal(item)}
                                            class="h-auto w-auto shrink-0 px-2 py-1.5 text-xs font-medium"
                                        >
                                            Update Access Token
                                        </Button>
                                        <button
                                            class="rounded p-1.5 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600"
                                            onclick={() => openEditForm(item)}
                                        >
                                            <PencilIcon class="size-4" />
                                        </button>
                                        <button
                                            class="rounded p-1.5 text-neutral-400 transition-colors hover:bg-red-50 hover:text-red-600"
                                            onclick={() => deleteAccess(item.id)}
                                        >
                                            <TrashIcon class="size-4" />
                                        </button>
                                    </div>
                                </div>
                                {#if testResult && testResult.id === item.id}
                                    <div
                                        class="mt-2 flex items-center gap-2 rounded-lg px-3 py-2 text-sm {testResult.success
                                            ? 'bg-emerald-50 text-emerald-700'
                                            : 'bg-red-50 text-red-700'}"
                                    >
                                        <span class="font-medium">{testResult.success ? 'Connected' : 'Failed'}:</span>
                                        {testResult.message}
                                    </div>
                                {/if}
                            </div>
                        {/each}
                    </div>
                {:else}
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-neutral-600">No Forgejo access configurations</p>
                            <p class="mt-1 text-sm text-neutral-400">
                                Add a Forgejo access token to connect repositories
                            </p>
                        </div>
                    </div>
                {/if}

                <div class="flex items-center gap-2">
                    <Button primary onclick={() => openAddModal('forgejo')} class="w-auto">
                        <span class="flex items-center gap-1.5">
                            <PlusIcon class="size-4" />
                            Add Access
                        </span>
                    </Button>
                </div>
            </div>
        </Card> -->

        <!-- GitHub Card -->
        <Card title="GitHub" border>
            {#if data.app}
                <div class="space-y-5">
                    <!-- App info -->
                    <div class="flex items-center justify-between">
                        <div class="flex items-center gap-3">
                            <div
                                class="flex size-10 items-center justify-center rounded-lg bg-neutral-100"
                            >
                                <GithubLogoIcon class="size-5 text-neutral-600" />
                            </div>
                            <div>
                                <p class="font-medium text-neutral-800">{data.app.slug}</p>
                                <p class="text-sm text-neutral-500">App ID: {data.app.appId}</p>
                            </div>
                        </div>
                        <button
                            class="flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-4 py-2 text-sm text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                            onclick={deleteApp}
                            disabled={isDeletingApp}
                        >
                            <TrashIcon class="size-4" />
                            {isDeletingApp ? 'Deleting...' : 'Delete'}
                        </button>
                    </div>

                    <!-- Installations -->
                    <div class="border-t border-neutral-200 pt-4 dark:border-neutral-700">
                        <h4 class="mb-3 text-sm font-medium text-neutral-700 dark:text-neutral-300">
                            Installations
                        </h4>
                        {#if data.installationList.length > 0}
                            <div class="divide-y divide-neutral-200 dark:divide-neutral-700">
                                {#each data.installationList as installation}
                                    <div
                                        class="flex items-center justify-between py-3 first:pt-0 last:pb-0"
                                    >
                                        <div class="flex items-center gap-3">
                                            <div
                                                class="flex size-8 items-center justify-center rounded bg-neutral-100 text-sm font-medium text-neutral-600"
                                            >
                                                {installation.accountType === 'Organization'
                                                    ? 'O'
                                                    : 'U'}
                                            </div>
                                            <div>
                                                <p class="font-medium text-neutral-800">
                                                    {installation.accountName ||
                                                        `Installation #${installation.installationId}`}
                                                </p>
                                                <p class="text-sm text-neutral-500">
                                                    {installation.accountType}
                                                </p>
                                            </div>
                                        </div>
                                        <button
                                            class="rounded p-1.5 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600"
                                            onclick={() => deleteInstallation(installation.id)}
                                        >
                                            <TrashIcon class="size-4" />
                                        </button>
                                    </div>
                                {/each}
                            </div>
                            <div class="mt-4">
                                <Button
                                    text
                                    onclick={getInstallUrl}
                                    disabled={isAddingInstallation}
                                >
                                    Add Installation
                                </Button>
                            </div>
                        {:else}
                            <div class="flex items-center justify-between">
                                <div>
                                    <p class="text-neutral-600">No installations found</p>
                                    <p class="mt-1 text-sm text-neutral-400">
                                        Install the app to your GitHub account or organization
                                    </p>
                                </div>
                                <Button onclick={getInstallUrl} disabled={isAddingInstallation}>
                                    {isAddingInstallation ? 'Opening...' : 'Add Installation'}
                                </Button>
                            </div>
                        {/if}
                    </div>
                </div>
            {:else}
                <div class="space-y-4">
                    <p class="text-neutral-600">
                        Register a GitHub App to enable integration with GitHub repositories.
                    </p>

                    <div class="flex flex-wrap gap-2">
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
                            <Button primary onclick={createAppManual} disabled={isCreatingApp}>
                                {isCreatingApp ? 'Saving...' : 'Save GitHub App'}
                            </Button>
                        </div>
                    {:else}
                        <div class="space-y-4">
                            <FormField
                                label="Public webhook base URL"
                                description="Must be reachable by GitHub (e.g., your tunnel to port 7901)"
                            >
                                {#snippet children({ id })}
                                    <InputText
                                        {id}
                                        placeholder="https://your-public-host:7901"
                                        bind:value={webhookUrl}
                                    />
                                {/snippet}
                            </FormField>
                            <Button
                                primary
                                onclick={createAppQuick}
                                disabled={!webhookUrl || isCreatingApp}
                            >
                                {isCreatingApp ? 'Creating...' : 'Connect GitHub App'}
                            </Button>
                        </div>
                    {/if}
                </div>
            {/if}
        </Card>
    </div>

    <!-- Add/Edit Modal -->
    <Modal bind:open={showModal} onclose={closeAccessModal}>
        <h3 class="mb-4 text-lg font-semibold tracking-tight dark:text-neutral-50">
            {modalTitle()}
        </h3>
        <div class="space-y-4">
            <FormField label="Provider">
                {#snippet children({ id })}
                    <Select
                        {id}
                        options={[
                            { value: 'gitlab', label: 'GitLab' },
                            { value: 'forgejo', label: 'Forgejo' }
                        ]}
                        value={formProvider}
                        disabled={editingId !== null}
                        onchange={(e) =>
                            (formProvider = (e.target as HTMLSelectElement).value as 'gitlab' | 'forgejo')}
                    />
                {/snippet}
            </FormField>
            <FormField label="Name" description="A friendly label for this connection">
                {#snippet children({ id })}
                    <InputText {id} placeholder={accessFormNamePlaceholder} bind:value={formName} />
                {/snippet}
            </FormField>
            <FormField label="Base URL" description={accessFormBaseUrlDescription}>
                {#snippet children({ id })}
                    <InputText
                        {id}
                        placeholder={accessFormBaseUrlPlaceholder}
                        bind:value={formBaseUrl}
                    />
                {/snippet}
            </FormField>
            {#if editingId === null}
                <FormField label="Access token" description={accessFormTokenDescription}>
                    {#snippet children({ id })}
                        <InputText
                            {id}
                            placeholder={accessFormTokenPlaceholder}
                            bind:value={formAccessToken}
                            password
                        />
                    {/snippet}
                </FormField>
            {/if}
            <FormField
                label="Bot username"
                description="Optional — used for mention detection in reply mode"
            >
                {#snippet children({ id })}
                    <InputText {id} placeholder={accessFormBotPlaceholder} bind:value={formBotUsername} />
                {/snippet}
            </FormField>
            <div class="flex items-center gap-2 pt-2">
                <Button
                    primary
                    onclick={saveAccess}
                    disabled={isSavingAccess}
                    class="w-auto"
                >
                    {isSavingAccess
                        ? 'Saving...'
                        : editingId !== null
                          ? 'Update'
                          : 'Save'}
                </Button>
                <Button
                    secondary
                    onclick={closeAccessModal}
                    disabled={isSavingAccess}
                    class="w-auto"
                >
                    Cancel
                </Button>
            </div>
        </div>
    </Modal>

    <!-- Update Access Token Modal -->
    <Modal bind:open={updateAccessTokenModalOpen} onclose={closeUpdateAccessTokenModal}>
        {#if selectedAccessId !== null && selectedAccessProvider !== null}
            <PatchSecret
                label="Update Access Token"
                description={patchSecretTokenDescription}
                placeholder={patchSecretTokenPlaceholder}
                patchEndpoint={`/access/${selectedAccessId}/access-token`}
                onSuccess={closeUpdateAccessTokenModal}
            />
        {/if}
    </Modal>
</DefaultLayout>
