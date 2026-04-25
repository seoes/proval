<script lang="ts">
    import { twMerge } from 'tailwind-merge';
    import type { Snippet } from 'svelte';

    interface Props {
        class?: string;
        /** 'above' — helper before the field (form sections). 'below' — after the field. */
        placement?: 'above' | 'below';
        children: Snippet;
    }
    let { class: className, placement = 'above', children }: Props = $props();
</script>

<p
    class={twMerge(
        placement === 'above'
            ? 'mb-1.5 text-xs text-neutral-500'
            : 'mt-1.5 ml-1 text-xs text-neutral-500',
        className
    )}
>
    {@render children()}
</p>
