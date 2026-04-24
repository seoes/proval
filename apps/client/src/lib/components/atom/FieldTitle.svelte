<script lang="ts">
    import { twMerge } from 'tailwind-merge';
    import type { Snippet } from 'svelte';

    interface Props {
        /** If set, renders a `<label>` for the control with this `id` (a11y). */
        forId?: string;
        class?: string;
        children: Snippet;
    }
    let { forId, class: className, children }: Props = $props();

    const titleClass = 'mb-0.5 block text-sm font-medium text-neutral-700';
</script>

{#if forId}
    <label for={forId} class={twMerge(titleClass, className)}>{@render children()}</label>
{:else}
    <div class={twMerge(titleClass, className)}>{@render children()}</div>
{/if}
