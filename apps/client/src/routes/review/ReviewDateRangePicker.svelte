<script lang="ts">
    import { twMerge } from "tailwind-merge";
    import Button from "$lib/components/atom/Button.svelte";
    import Calendar from "$lib/components/molecule/Calendar.svelte";
    import FormField from "$lib/components/molecule/FormField.svelte";
    import { formatReviewDateRangeLabel, type ReviewFilter } from "./filterQuery.js";

    type Props = {
        filter: ReviewFilter;
        onFilterChange: (filter: ReviewFilter) => void;
    };

    let { filter, onFilterChange }: Props = $props();

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
    <FormField label="Date">
        {#snippet children({ id })}
            <div bind:this={containerRef} class="relative">
                <button
                    type="button"
                    {id}
                    class="flex h-10 w-full cursor-pointer items-center justify-between gap-2 rounded-lg border border-input bg-input-background px-4 text-left text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    aria-haspopup="dialog"
                    aria-expanded={open}
                    onclick={(event) => {
                        event.stopPropagation();
                        toggleOpen();
                    }}>
                    <span class="min-w-0 truncate text-foreground">{triggerLabel}</span>
                    <svg
                        class={twMerge(
                            "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                            open && "rotate-180",
                        )}
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
                    <div
                        class="absolute top-full left-0 z-50 mt-1 sm:right-0 sm:left-auto"
                        role="dialog"
                        aria-label="Choose date range">
                        {#key `${filter.from}-${filter.to}`}
                            <Calendar from={filter.from} to={filter.to} onRangeChange={updateRange} />
                        {/key}
                        {#if filter.from || filter.to}
                            <div
                                class="mt-1 flex justify-end rounded-lg border border-border bg-popover px-2 py-1.5 text-popover-foreground shadow-lg">
                                <Button text size="sm" onclick={clearRange}>Clear dates</Button>
                            </div>
                        {/if}
                    </div>
                {/if}
            </div>
        {/snippet}
    </FormField>
</div>
