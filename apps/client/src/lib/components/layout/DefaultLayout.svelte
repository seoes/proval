<script lang="ts">
    import type { Snippet } from "svelte";

    interface Props {
        children: Snippet;
        title: string;
        narrow?: boolean;
        /** Wider main column below xl when aside is hidden. Use on dashboard and repo overview. */
        asideLayout?: boolean;
        actions?: Snippet;
    }
    const { children, title, narrow = false, asideLayout = false, actions }: Props = $props();

    const containerClass = $derived(
        narrow ? "max-w-lg" : asideLayout ? "max-w-7xl xl:max-w-6xl" : "max-w-6xl",
    );
</script>

<svelte:head>
    <title>{title} · Proval{import.meta.env.DEV ? " [DEV]" : ""}</title>
</svelte:head>

<div class="mx-auto {containerClass}">
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
