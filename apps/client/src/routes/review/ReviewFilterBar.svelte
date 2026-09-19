<script lang="ts">
    import type { Activity, RepositoryResponse } from "@proval/types";
    import { twMerge } from "tailwind-merge";
    import Button from "$lib/components/atom/Button.svelte";
    import Select from "$lib/components/atom/Select.svelte";
    import ReviewDateRangePicker from "./ReviewDateRangePicker.svelte";
    import {
        REVIEW_STATUS_OPTION_LIST,
        REVIEW_TYPE_OPTION_LIST,
        toggleRepositoryId,
        type ReviewFilter,
    } from "./filterQuery.js";

    type Props = {
        filter: ReviewFilter;
        repositoryList: RepositoryResponse[];
        showClear: boolean;
        onFilterChange: (filter: ReviewFilter) => void;
        onClear: () => void;
    };

    let { filter, repositoryList, showClear, onFilterChange, onClear }: Props = $props();

    let repositoryOpen = $state(false);
    let repositoryContainerRef: HTMLDivElement | undefined = $state();

    const statusSelectOptionList = $derived([
        { value: "", label: "All" },
        ...REVIEW_STATUS_OPTION_LIST.map((option) => ({ value: option.value, label: option.label })),
    ]);

    const typeSelectOptionList = $derived([
        { value: "", label: "All" },
        ...REVIEW_TYPE_OPTION_LIST.map((option) => ({ value: option.value, label: option.label })),
    ]);

    let statusValue = $state("");
    let typeValue = $state("");

    $effect(() => {
        statusValue = filter.statusList[0] ?? "";
        typeValue = filter.typeList[0] ?? "";
    });

    const filterControlClass = "bg-white dark:bg-white";

    const sortedRepositoryList = $derived(
        [...repositoryList].sort((a, b) => a.path.localeCompare(b.path)),
    );

    const repositoryLabel = $derived.by(() => {
        const count = filter.repositoryIdList.length;
        if (count === 0) return "All repositories";
        if (count === 1) {
            const repo = repositoryList.find((item) => item.id === filter.repositoryIdList[0]);
            return repo?.path ?? "1 repository";
        }
        return `${count} repositories`;
    });

    function updateFilter(next: ReviewFilter) {
        onFilterChange({ ...next, page: 1 });
    }

    function onStatusValueChange(value: string) {
        updateFilter({
            ...filter,
            statusList: value ? [value as Activity["status"]] : [],
        });
    }

    function onTypeValueChange(value: string) {
        updateFilter({
            ...filter,
            typeList: value ? [value as Activity["type"]] : [],
        });
    }

    function toggleRepository(id: number) {
        updateFilter({
            ...filter,
            repositoryIdList: toggleRepositoryId(filter.repositoryIdList, id),
        });
    }

    function closeRepositoryMenu() {
        repositoryOpen = false;
    }

    function toggleRepositoryMenu() {
        repositoryOpen = !repositoryOpen;
    }

    function handleRepositoryClickOutside(event: MouseEvent) {
        if (repositoryContainerRef && !repositoryContainerRef.contains(event.target as Node)) {
            closeRepositoryMenu();
        }
    }

    $effect(() => {
        if (!repositoryOpen) return;
        document.addEventListener("click", handleRepositoryClickOutside);
        return () => document.removeEventListener("click", handleRepositoryClickOutside);
    });
</script>

<div class="mb-4">
    <div class="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <div class="min-w-0 flex-1 sm:max-w-[11rem]">
            <Select
                label="Status"
                options={statusSelectOptionList}
                bind:value={statusValue}
                onValueChange={onStatusValueChange}
                placeholder="All"
                class={filterControlClass}
                menuClass={filterControlClass} />
        </div>
        <div class="min-w-0 flex-1 sm:max-w-[11rem]">
            <Select
                label="Type"
                options={typeSelectOptionList}
                bind:value={typeValue}
                onValueChange={onTypeValueChange}
                placeholder="All"
                class={filterControlClass}
                menuClass={filterControlClass} />
        </div>
        <div class="min-w-0 flex-1 sm:max-w-xs">
            <p class="mb-1 text-xs font-medium text-neutral-500">Repository</p>
            <div bind:this={repositoryContainerRef} class="relative">
                <button
                    type="button"
                    class={twMerge(
                        "flex h-10 w-full cursor-pointer items-center justify-between gap-2 rounded-lg border border-neutral-200 px-3 text-left text-sm outline-none dark:border-neutral-700",
                        filterControlClass,
                    )}
                    aria-haspopup="listbox"
                    aria-expanded={repositoryOpen}
                    onclick={toggleRepositoryMenu}>
                    <span class="min-w-0 truncate text-neutral-900 dark:text-white">{repositoryLabel}</span>
                    <svg
                        class={twMerge("h-4 w-4 shrink-0 text-neutral-400 transition-transform", repositoryOpen && "rotate-180")}
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        aria-hidden="true">
                        <path
                            fill-rule="evenodd"
                            d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                            clip-rule="evenodd" />
                    </svg>
                </button>
                {#if repositoryOpen}
                    <ul
                        class={twMerge(
                            "absolute top-full z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-neutral-200 shadow-lg dark:border-neutral-700",
                            filterControlClass,
                        )}
                        role="listbox"
                        aria-label="Repository filter">
                        {#if sortedRepositoryList.length === 0}
                            <li class="px-3 py-2 text-sm text-neutral-500">No repositories</li>
                        {:else}
                            {#each sortedRepositoryList as repo (repo.id)}
                                {@const selected = filter.repositoryIdList.includes(repo.id)}
                                <li>
                                    <button
                                        type="button"
                                        role="option"
                                        aria-selected={selected}
                                        class={twMerge(
                                            "flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm hover:bg-neutral-100 dark:hover:bg-neutral-700",
                                            selected && "bg-primary/5",
                                        )}
                                        onclick={(event) => {
                                            event.stopPropagation();
                                            toggleRepository(repo.id);
                                        }}>
                                        <span
                                            class={twMerge(
                                                "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                                                selected
                                                    ? "border-primary bg-primary text-primary-foreground"
                                                    : "border-neutral-300 dark:border-neutral-600",
                                            )}
                                            aria-hidden="true">
                                            {#if selected}
                                                <svg class="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                                                    <path
                                                        fill-rule="evenodd"
                                                        d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
                                                        clip-rule="evenodd" />
                                                </svg>
                                            {/if}
                                        </span>
                                        <span class="min-w-0 truncate">{repo.path}</span>
                                    </button>
                                </li>
                            {/each}
                        {/if}
                    </ul>
                {/if}
            </div>
        </div>

        <ReviewDateRangePicker filter={filter} controlClass={filterControlClass} onFilterChange={updateFilter} />

        {#if showClear}
            <div class="sm:pb-0.5">
                <Button text size="sm" onclick={onClear}>Clear</Button>
            </div>
        {/if}
    </div>
</div>
