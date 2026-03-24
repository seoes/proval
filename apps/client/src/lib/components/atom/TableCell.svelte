<script lang="ts">
    import { twMerge } from 'tailwind-merge';
    import type { Snippet } from 'svelte';

    interface Props {
        children: Snippet;
        class?: string;
    }
    let { children, class: className }: Props = $props();
</script>

<td class={twMerge('px-4 py-3 text-sm text-neutral-500', className)}>
    {@render children()}
</td>
