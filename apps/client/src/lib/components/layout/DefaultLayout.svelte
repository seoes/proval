<script lang="ts">
    import type { Snippet } from "svelte";

    interface Props {
        children: Snippet;
        title: string;
        narrow?: boolean;
        actions?: Snippet;
    }
    const { children, title, narrow = false, actions }: Props = $props();
</script>

<svelte:head>
    <title>{title} — Proval</title>
</svelte:head>

<div class="mx-auto {narrow ? 'max-w-lg' : 'max-w-6xl'}">
    <div class="flex items-center justify-between gap-4">
        <h2 class="text-lg font-semibold">{title}</h2>
        {#if actions}
            <div class="shrink-0">
                {@render actions()}
            </div>
        {/if}
    </div>
    <div class="mt-8">
        {@render children?.()}
    </div>
</div>
