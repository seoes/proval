<script lang="ts">
    import type { Snippet } from "svelte";
    import { twMerge } from "tailwind-merge";
    import GitProviderIcon from "$lib/components/atom/GitProviderIcon.svelte";
    import type { RepositoryProvider } from "@proval/types";

    interface Props {
        href?: string;
        header: Snippet;
        badge: Snippet;
        provider?: RepositoryProvider;
        compact?: boolean;
        embedded?: boolean;
        class?: string;
    }

    const { href, header, badge, provider, compact = false, embedded = false, class: className }: Props = $props();

    const cardClass = $derived(
        twMerge(
            "block bg-white transition-colors",
            embedded ? "border-b border-neutral-200 last:border-b-0" : "rounded-lg border border-neutral-200",
            compact ? "px-4 py-2.5" : "p-4",
            href && !embedded && "hover:border-neutral-300 hover:bg-neutral-50",
            href && embedded && "hover:bg-neutral-50",
            className,
        ),
    );

    const bodyClass = $derived(
        compact
            ? "flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between lg:gap-3"
            : "flex flex-wrap items-start justify-between gap-x-4 gap-y-2",
    );

    const headerWrapClass = $derived(twMerge("min-w-0 flex flex-1 items-center gap-2", compact ? "w-full" : ""));

    const badgeWrapClass = $derived(twMerge("flex flex-wrap gap-1.5", compact ? "lg:shrink-0" : "mt-2 w-full"));
</script>

{#snippet cardBody()}
    <div class={bodyClass}>
        <div class={headerWrapClass}>
            {#if provider}
                <GitProviderIcon {provider} boxed class="shrink-0" />
            {/if}
            <div class="min-w-0 flex-1">
                {@render header()}
            </div>
        </div>
        <div class={badgeWrapClass}>
            {@render badge()}
        </div>
    </div>
{/snippet}

{#if href}
    <a {href} class={cardClass}>
        {@render cardBody()}
    </a>
{:else}
    <div class={cardClass}>
        {@render cardBody()}
    </div>
{/if}
