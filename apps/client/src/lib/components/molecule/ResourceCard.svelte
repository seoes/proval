<script lang="ts">
    import type { Snippet } from "svelte";
    import { twMerge } from "tailwind-merge";

    interface Props {
        href?: string;
        header: Snippet;
        badges: Snippet;
    }

    const { href, header, badges }: Props = $props();

    const cardClass = twMerge(
        "block rounded-lg border border-neutral-200 bg-white p-4 transition-colors",
        href && "hover:border-neutral-300 hover:bg-neutral-50",
    );
</script>

{#if href}
    <a {href} class={cardClass}>
        <div class="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
            {@render header()}
        </div>
        <div class="mt-4 flex flex-wrap gap-1.5">
            {@render badges()}
        </div>
    </a>
{:else}
    <div class={cardClass}>
        <div class="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
            {@render header()}
        </div>
        <div class="mt-4 flex flex-wrap gap-1.5">
            {@render badges()}
        </div>
    </div>
{/if}
