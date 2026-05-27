<script lang="ts">
    import DefaultLayout from "$lib/components/layout/DefaultLayout.svelte";
    import RepositoryForm from "$lib/components/organism/RepositoryForm.svelte";
    import GitProviderIcon from "$lib/components/atom/GitProviderIcon.svelte";
    import FormField from "$lib/components/molecule/FormField.svelte";
    import Card from "$lib/components/layout/Card.svelte";
    import Button from "$lib/components/atom/Button.svelte";
    import { goto } from "$app/navigation";
    import { openAlert } from "$lib/store/modal";
    import { onMount } from "svelte";
    import type { RepositoryProvider, RepositorySelectItem, UnifiedAccessOption } from "@proval/types";
    import { loadRepositoryList } from "$lib/utils/repository-list";
    import type { PageProps } from "./$types";

    let { data }: PageProps = $props();

    let step = $state(1);
    let selectedAccessKey = $state("");

    let provider = $state<RepositoryProvider | "">("");
    let gitProviderAccessId = $state("");
    let gitProviderRepositoryId = $state("");
    let githubInstallationId = $state("");
    let githubRepositoryId = $state<number | null>(null);
    let repositoryPath = $state("");
    let selectedRepositoryId = $state("");

    let repositoryList = $state<RepositorySelectItem[]>([]);
    let isLoadingRepositoryList = $state(false);

    const selectedAccess = $derived(
        data.unifiedAccessOptions.find((option) => accessOptionKey(option) === selectedAccessKey) ?? null,
    );

    const filteredAccessList = $derived(
        data.accessList.filter((access) => access.provider === provider),
    );

    const selectClass =
        "h-10 w-full rounded-xl border border-neutral-200 bg-gray-50 px-4 text-sm outline-none disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-800";

    function accessOptionKey(option: UnifiedAccessOption): string {
        return `${option.kind}:${option.id}`;
    }

    async function fetchRepositoryList() {
        isLoadingRepositoryList = true;
        try {
            if (provider === "github" && data.app && githubInstallationId) {
                repositoryList = await loadRepositoryList({
                    provider: "github",
                    appId: data.app.id,
                    installationId: parseInt(githubInstallationId, 10),
                });
            } else if (
                gitProviderAccessId &&
                (provider === "gitlab" || provider === "forgejo")
            ) {
                repositoryList = await loadRepositoryList({
                    provider,
                    accessId: parseInt(gitProviderAccessId, 10),
                });
            } else {
                repositoryList = [];
            }
        } finally {
            isLoadingRepositoryList = false;
        }
    }

    $effect(() => {
        if (step === 2 && provider) {
            fetchRepositoryList();
        }
    });

    onMount(async () => {
        if (data.unifiedAccessOptions.length === 0) {
            await openAlert("No access or GitHub installation found. Configure one in Git Provider first.");
            goto("/provider");
        }
    });

    function selectAccess(option: UnifiedAccessOption) {
        selectedAccessKey = accessOptionKey(option);
        provider = option.provider;
        gitProviderRepositoryId = "";
        githubRepositoryId = null;
        repositoryPath = "";
        selectedRepositoryId = "";

        if (option.kind === "git-provider") {
            gitProviderAccessId = option.id.toString();
            githubInstallationId = "";
        } else {
            githubInstallationId = option.id.toString();
            gitProviderAccessId = "";
        }
    }

    async function continueFromAccess() {
        if (!selectedAccess) {
            await openAlert("Select an access or installation");
            return;
        }
        step = 2;
    }

    async function continueFromRepository() {
        if (!selectedRepositoryId) {
            await openAlert("Select a repository");
            return;
        }

        const selected = repositoryList.find((repo) => repo.id.toString() === selectedRepositoryId);
        if (!selected) {
            await openAlert("Select a repository");
            return;
        }

        if (selected.alreadyConnected) {
            await openAlert("This repository is already connected to Proval");
            return;
        }

        repositoryPath = selected.fullName;

        if (provider === "gitlab" || provider === "forgejo") {
            gitProviderRepositoryId = selected.id.toString();
        } else if (provider === "github") {
            githubRepositoryId = selected.id;
        }

        step = 3;
    }
</script>

<DefaultLayout narrow title="Create Repository">
    <div class="space-y-6">
        <div class="flex items-center gap-2 text-sm">
            {#each [1, 2, 3] as s}
                <div class="flex items-center">
                    <div
                        class="flex h-8 w-8 items-center justify-center rounded-full {step >= s
                            ? 'bg-primary text-white'
                            : 'bg-neutral-200 text-neutral-500 dark:bg-neutral-700'}">
                        {s}
                    </div>
                    {#if s < 3}
                        <div class="h-0.5 w-8 {step > s ? 'bg-primary' : 'bg-neutral-200 dark:bg-neutral-700'}"></div>
                    {/if}
                </div>
            {/each}
        </div>

        {#if step === 1}
            <Card title="Step 1: Access">
                <div class="space-y-4">
                    <p class="text-sm text-neutral-600 dark:text-neutral-400">
                        Select an access configuration or GitHub installation.
                    </p>
                    {#if data.unifiedAccessOptions.length === 0}
                        <p class="text-neutral-500">No access or installation available.</p>
                    {:else}
                        <div class="flex flex-col gap-2">
                            {#each data.unifiedAccessOptions as option}
                                <button
                                    type="button"
                                    class="flex items-center gap-3 rounded-xl border p-3 text-left transition-colors {selectedAccessKey ===
                                    accessOptionKey(option)
                                        ? 'border-primary bg-primary/10'
                                        : 'border-neutral-200 hover:border-neutral-300 dark:border-neutral-700'}"
                                    onclick={() => selectAccess(option)}>
                                    <GitProviderIcon provider={option.provider} />
                                    <div class="min-w-0 flex-1">
                                        <div class="font-medium">{option.label}</div>
                                        <div class="text-sm text-neutral-500">
                                            {#if option.kind === "git-provider"}
                                                {option.provider} · {option.baseUrl}
                                            {:else}
                                                GitHub · {option.accountType}
                                            {/if}
                                        </div>
                                    </div>
                                </button>
                            {/each}
                        </div>
                    {/if}
                    <div class="flex justify-between">
                        <Button primary onclick={continueFromAccess} disabled={!selectedAccess}>Continue</Button>
                        <Button text onclick={() => goto("/repository")}>Cancel</Button>
                    </div>
                </div>
            </Card>
        {/if}

        {#if step === 2 && provider}
            <Card title="Step 2: Repository">
                <div class="space-y-4">
                    <FormField
                        label="Repository"
                        description={isLoadingRepositoryList
                            ? "Loading repository list..."
                            : "Select a repository from the list"}>
                        {#snippet children({ id })}
                            <select
                                {id}
                                bind:value={selectedRepositoryId}
                                disabled={repositoryList.length === 0 || isLoadingRepositoryList}
                                class={selectClass}>
                                <option value="">
                                    {isLoadingRepositoryList
                                        ? "Loading..."
                                        : repositoryList.length === 0
                                          ? "No repositories available"
                                          : "Select a repository"}
                                </option>
                                {#each repositoryList as repo}
                                    <option value={repo.id.toString()}>
                                        {repo.fullName}{repo.alreadyConnected ? " (connected)" : ""}
                                    </option>
                                {/each}
                            </select>
                        {/snippet}
                    </FormField>
                    <div class="flex justify-between">
                        <div class="flex gap-2">
                            <Button secondary onclick={() => (step = 1)} type="button">Back</Button>
                            <Button primary onclick={continueFromRepository}>Continue</Button>
                        </div>
                        <Button text onclick={() => goto("/repository")}>Cancel</Button>
                    </div>
                </div>
            </Card>
        {/if}

        {#if step === 3 && provider}
            <div class="space-y-4">
                <RepositoryForm
                    mode="create"
                    {provider}
                    modelList={data.modelList}
                    accessList={filteredAccessList}
                    installationList={data.installationList}
                    githubAppId={data.app?.id ?? null}
                    initialData={{
                        gitProviderAccessId: gitProviderAccessId ? parseInt(gitProviderAccessId, 10) : null,
                        gitProviderRepositoryId: gitProviderRepositoryId
                            ? parseInt(gitProviderRepositoryId, 10)
                            : null,
                        githubInstallationId: githubInstallationId ? parseInt(githubInstallationId, 10) : null,
                        githubRepositoryId,
                        path: repositoryPath,
                    }} />
                <Button secondary onclick={() => (step = 2)} type="button">Back</Button>
            </div>
        {/if}
    </div>
</DefaultLayout>
