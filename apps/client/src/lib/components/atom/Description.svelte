<script lang="ts">
    import { twMerge } from 'tailwind-merge';
    import type { Snippet } from 'svelte';

    interface Props {
        class?: string;
        children: Snippet;
    }
    let { class: className, children }: Props = $props();
</script>

<p class={twMerge('mt-1.5 ml-1 text-xs text-neutral-500', className)}>{@render children()}</p>
