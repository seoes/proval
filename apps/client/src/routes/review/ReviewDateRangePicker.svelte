<script lang="ts">
    import { twMerge } from "tailwind-merge";
    import Button from "$lib/components/atom/Button.svelte";
    import Calendar from "$lib/components/molecule/Calendar.svelte";
    import { formatReviewDateRangeLabel, type ReviewFilter } from "./filterQuery.js";

    type Props = {
        filter: ReviewFilter;
        controlClass: string;
        onFilterChange: (filter: ReviewFilter) => void;
    };

    let { filter, controlClass, onFilterChange }: Props = $props();

    let open = $state(false);
    let containerRef: HTMLDivElement | undefined = $state();

    const triggerLabel = $derived(formatReviewDateRangeLabel(filter.from, filter.to));

    function updateRange(from: string, to: string) {
        onFilterChange({ ...filter, from, to, page: 1 });
    }

    function clearRange() {
        onFilterChange({ ...filter, from: "", to: "", page: 1 });
        open = false;
    }

    function toggleOpen() {
        open = !open;
    }

    function handleClickOutside(event: MouseEvent) {
        if (containerRef && !containerRef.contains(event.target as Node)) {
            open = false;
        }
    }

    $effect(() => {
        if (!open) return;
        const onDocumentClick = (event: MouseEvent) => handleClickOutside(event);
        const id = requestAnimationFrame(() => {
            document.addEventListener("click", onDocumentClick);
        });
        return () => {
            cancelAnimationFrame(id);
            document.removeEventListener("click", onDocumentClick);
        };
    });
</script>

<div class="min-w-0 flex-1 sm:max-w-[14rem]">
    <p class="mb-1 text-xs font-medium text-neutral-500">Date</p>
    <div bind:this={containerRef} class="relative">
        <button
            type="button"
            class={twMerge(
                "flex h-10 w-full cursor-pointer items-center justify-between gap-2 rounded-lg border border-neutral-200 px-3 text-left text-sm outline-none dark:border-neutral-700",
                controlClass,
            )}
            aria-haspopup="dialog"
            aria-expanded={open}
            onclick={(event) => {
                event.stopPropagation();
                toggleOpen();
            }}>
            <span class="min-w-0 truncate text-neutral-900 dark:text-white">{triggerLabel}</span>
            <svg
                class={twMerge("h-4 w-4 shrink-0 text-neutral-400 transition-transform", open && "rotate-180")}
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true">
                <path
                    fill-rule="evenodd"
                    d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                    clip-rule="evenodd" />
            </svg>
        </button>

        {#if open}
            <div class="absolute top-full left-0 z-50 mt-1" role="dialog" aria-label="Choose date range">
                {#key `${filter.from}-${filter.to}`}
                    <Calendar from={filter.from} to={filter.to} onRangeChange={updateRange} />
                {/key}
                {#if filter.from || filter.to}
                    <div
                        class={twMerge(
                            "mt-1 flex justify-end rounded-lg border border-neutral-200 bg-white px-2 py-1.5 shadow-lg dark:border-neutral-700",
                            controlClass,
                        )}>
                        <Button text size="sm" onclick={clearRange}>Clear dates</Button>
                    </div>
                {/if}
            </div>
        {/if}
    </div>
</div>
