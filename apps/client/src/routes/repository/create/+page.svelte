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
    import type { ProviderOption, RepositorySelectItem } from "@proval/types";
    import { loadGitAccessRepositoryList, loadGitHubInstallationRepositoryList } from "$lib/utils/repository-list";
    import type { PageProps } from "./$types";

    const { data }: PageProps = $props();

    let step = $state(1);

    let isLoadingRepositoryList = $state(false);
    let repositoryList = $state<RepositorySelectItem[]>([]);
    let selectedRepositoryId = $state<number | null>(null);

    let selectedProviderOption = $state<ProviderOption | null>(null);

    const selectClass =
        "h-10 w-full rounded-xl border border-neutral-200 bg-gray-50 px-4 text-sm outline-none disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-800";

    $effect(() => {
        if (selectedProviderOption) {
            async function fetchRepositoryList() {
                isLoadingRepositoryList = true;
                try {
                    if (selectedProviderOption?.type === "github") {
                        repositoryList = await loadGitHubInstallationRepositoryList(
                            selectedProviderOption.githubInstallationId,
                        );
                    } else if (
                        selectedProviderOption?.type === "gitlab" ||
                        selectedProviderOption?.type === "forgejo"
                    ) {
                        repositoryList = await loadGitAccessRepositoryList(selectedProviderOption.accessId);
                    } else {
                        repositoryList = [];
                    }
                } finally {
                    isLoadingRepositoryList = false;
                }
            }
            fetchRepositoryList();
        }
    });

    onMount(async () => {
        if (data.providerOptionList.length === 0) {
            await openAlert("No access or GitHub installation found. Configure one in Git Provider first.");
            goto("/provider");
        }
    });
</script>

<DefaultLayout narrow title="Create Repository">
    <div class="space-y-6">
        <div class="flex items-center gap-2 text-sm">
            {#each [1, 2] as s}
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
            <Card title="Step 1: Git Repository">
                <div class="space-y-4">
                    <p class="text-sm text-neutral-600 dark:text-neutral-400">Choose your git repository</p>
                    <div class="flex flex-col gap-2">
                        {#each data.providerOptionList as option}
                            <button
                                type="button"
                                class="flex items-center gap-3 rounded-xl border p-3 text-left transition-colors {selectedProviderOption?.label ===
                                    option.label && selectedProviderOption?.type === option.type
                                    ? 'border-primary bg-primary/10'
                                    : 'border-neutral-200 hover:border-neutral-300 dark:border-neutral-700'}"
                                onclick={() => (selectedProviderOption = option)}>
                                <GitProviderIcon provider={option.type} />
                                <div class="min-w-0 flex-1">
                                    <div class="font-medium">{option.label}</div>
                                    <div class="text-sm text-neutral-500">
                                        {#if option.type === "gitlab" || option.type === "forgejo"}
                                            {option.type} · {option.baseUrl}
                                        {:else}
                                            GitHub · {option.type}
                                        {/if}
                                    </div>
                                </div>
                            </button>
                        {/each}
                        <div class="mt-4">
                            <FormField
                                description={isLoadingRepositoryList
                                    ? "Loading repository list..."
                                    : "Select a repository from the list"}>
                                {#snippet children({ id })}
                                    <select
                                        {id}
                                        bind:value={selectedRepositoryId}
                                        disabled={!selectedProviderOption ||
                                            repositoryList.length === 0 ||
                                            isLoadingRepositoryList}
                                        class={selectClass}>
                                        <option value="">
                                            {isLoadingRepositoryList
                                                ? "Loading..."
                                                : repositoryList.length === 0
                                                  ? "No repositories available"
                                                  : "Select a repository"}
                                        </option>
                                        {#each repositoryList as r}
                                            <option value={r.id.toString()}>
                                                {r.path}{r.isConnected ? " (connected)" : ""}
                                            </option>
                                        {/each}
                                    </select>
                                {/snippet}
                            </FormField>
                        </div>
                        <div class="mt-4 flex justify-between">
                            <Button primary onclick={() => (step = 2)} disabled={!selectedProviderOption}
                                >Continue</Button>
                            <Button text onclick={() => goto("/repository")}>Cancel</Button>
                        </div>
                    </div>
                </div>
            </Card>
        {/if}

        {#if step === 2 && selectedRepositoryId && selectedProviderOption}
            <div class="space-y-4">
                <RepositoryForm
                    mode="create"
                    provider={selectedProviderOption}
                    modelList={data.modelList}
                    {selectedRepositoryId}
                    {repositoryList} />
                <Button secondary onclick={() => (step = 1)} type="button">Back</Button>
            </div>
        {/if}
    </div>
</DefaultLayout>
