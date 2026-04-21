<script lang="ts">
    import type { Snippet } from 'svelte';

    interface Props {
        children: Snippet;
        border?: boolean;
        title?: string;
    }
    let { children, border = false, title }: Props = $props();
</script>

<div>
    {#if title}
        <div class="mb-3 pl-1">
            <h3 class="text-md font-medium text-neutral-800 dark:text-white">{title}</h3>
        </div>
    {/if}
    <div
        class="rounded-lg {border
            ? 'border'
            : 'border-none'} border-neutral-200 bg-white px-6 py-5 dark:border-neutral-700 dark:bg-neutral-800"
    >
        {@render children()}
    </div>
</div>
