<script lang="ts">
    import type { RepositorySelectItem } from "@proval/types";
    import { twMerge } from "tailwind-merge";
    import Button from "../atom/Button.svelte";
    import Description from "../atom/Description.svelte";
    import FieldTitle from "../atom/FieldTitle.svelte";
    import InputText from "../atom/InputText.svelte";
    import Modal from "../atom/Modal.svelte";
    import FormField from "../molecule/FormField.svelte";

    type Props = {
        id?: string;
        label?: string;
        description?: string;
        placeholder?: string;
        disabled?: boolean;
        loading?: boolean;
        repositoryList: RepositorySelectItem[];
        allowConnectedId?: number;
        value?: string;
    };

    let {
        id,
        label,
        description,
        placeholder = "Select a repository",
        disabled = false,
        loading = false,
        repositoryList,
        allowConnectedId,
        value = $bindable(""),
    }: Props = $props();

    let open = $state(false);
    let filterQuery = $state("");

    const selectedItem = $derived(repositoryList.find((item) => item.id.toString() === value));
    const displayLabel = $derived(selectedItem?.path ?? (loading ? "Loading..." : value ? value : placeholder));
    const isPlaceholder = $derived(!selectedItem && !value);

    const filteredRepositoryList = $derived.by(() => {
        const query = filterQuery.trim().toLowerCase();
        if (!query) return repositoryList;
        return repositoryList.filter((item) => item.path.toLowerCase().includes(query));
    });

    function isRowLocked(item: RepositorySelectItem): boolean {
        if (!item.isConnected) return false;
        return allowConnectedId == null || item.id !== allowConnectedId;
    }

    function openPicker() {
        if (disabled) return;
        filterQuery = "";
        open = true;
    }

    function selectItem(item: RepositorySelectItem) {
        if (isRowLocked(item)) return;
        value = item.id.toString();
        open = false;
    }
</script>

<FormField {label} {description} {id}>
    {#snippet children({ id: triggerId })}
        <button
            type="button"
            id={triggerId}
            {disabled}
            class={twMerge(
                "flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-4 text-left text-sm outline-none dark:border-neutral-700 dark:bg-neutral-800",
                disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
            )}
            onclick={openPicker}>
            <span
                class={twMerge(
                    "min-w-0 truncate",
                    isPlaceholder ? "text-neutral-400 dark:text-neutral-500" : "text-neutral-900 dark:text-white",
                )}>
                {displayLabel}
            </span>
            <svg class="h-4 w-4 shrink-0 text-neutral-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path
                    fill-rule="evenodd"
                    d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                    clip-rule="evenodd" />
            </svg>
        </button>
    {/snippet}
</FormField>

<Modal bind:open class="max-w-xl">
    <div class="space-y-4">
        <FieldTitle>Select repository</FieldTitle>
        <Description>Type to filter the list, then choose a repository.</Description>
        <InputText placeholder="group/repository" bind:value={filterQuery} />
        {#if loading}
            <Description>Loading repositories...</Description>
        {:else if repositoryList.length === 0}
            <Description>No repositories were returned by this connection.</Description>
        {:else}
            <div class="h-80 overflow-y-auto rounded-xl border border-neutral-200 p-1 dark:border-neutral-700">
                {#if filteredRepositoryList.length === 0}
                    <div class="flex h-full items-center justify-center px-3">
                        <Description class="text-center">No matching repositories.</Description>
                    </div>
                {:else}
                    <ul class="space-y-1">
                        {#each filteredRepositoryList as item (item.id)}
                            {@const locked = isRowLocked(item)}
                            <li>
                                <button
                                    type="button"
                                    disabled={locked}
                                    class="w-full rounded-lg px-3 py-2 text-left text-sm transition-colors {locked
                                        ? 'cursor-not-allowed opacity-60'
                                        : 'cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-700'} {value ===
                                    item.id.toString()
                                        ? 'bg-primary/10 text-neutral-900 dark:text-neutral-100'
                                        : 'text-neutral-800 dark:text-neutral-200'}"
                                    onclick={() => selectItem(item)}>
                                    <span class="block truncate">{item.path}</span>
                                    {#if item.isConnected}
                                        <span class="mt-0.5 block text-xs text-neutral-500">Already connected</span>
                                    {/if}
                                </button>
                            </li>
                        {/each}
                    </ul>
                {/if}
            </div>
        {/if}
        <div class="flex justify-end pt-1">
            <Button text type="button" onclick={() => (open = false)}>Cancel</Button>
        </div>
    </div>
</Modal>
