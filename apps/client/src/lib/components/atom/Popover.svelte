<script lang="ts">
    import type { Snippet } from 'svelte';
    import { twMerge } from 'tailwind-merge';

    interface ButtonItem {
        onclick: () => void;
        label: string;
    }

    interface Props {
        buttonList: ButtonItem[];
        children: Snippet;
    }

    let { buttonList, children }: Props = $props();

    let open = $state(false);
    let containerRef: HTMLDivElement;

    function togglePopover() {
        open = !open;
    }

    function handleClickOutside(event: MouseEvent) {
        if (containerRef && !containerRef.contains(event.target as Node)) {
            open = false;
        }
    }

    function handleButtonClick(item: ButtonItem) {
        item.onclick();
        open = false;
    }

    $effect(() => {
        if (open) {
            document.addEventListener('click', handleClickOutside);
        }

        return () => {
            document.removeEventListener('click', handleClickOutside);
        };
    });
</script>

<div bind:this={containerRef} class="relative inline-flex h-min">
    <button type="button" onclick={togglePopover} class="h-min cursor-pointer">
        {@render children()}
    </button>

    {#if open}
        <div
            class={twMerge(
                'absolute top-full right-0 z-50 mt-1 w-max rounded-lg border border-neutral-200 bg-white shadow-lg dark:border-neutral-700 dark:bg-neutral-800'
            )}
        >
            {#each buttonList as item}
                <button
                    type="button"
                    onclick={() => handleButtonClick(item)}
                    class="block w-full cursor-pointer px-4 py-2 text-left text-sm text-neutral-700 transition-colors hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-700"
                >
                    {item.label}
                </button>
            {/each}
        </div>
    {/if}
</div>
