<script lang="ts">
    import { twMerge } from 'tailwind-merge';
    import type { Snippet } from 'svelte';

    interface Props {
        children: Snippet;
        class?: string;
    }
    let { children, class: className }: Props = $props();
</script>

<th class={twMerge('px-1.5 py-3 text-left font-medium text-neutral-600', className)}>
    {@render children()}
</th>
