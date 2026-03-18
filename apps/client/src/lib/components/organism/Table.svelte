<!-- eslint-disable @typescript-eslint/no-explicit-any -->
<script lang="ts" generics="T extends Record<string, any>">
    import type { Snippet } from 'svelte';

    interface Props {
        body: T[];
        renderHeader: Snippet<[]>;
        renderBody: Snippet<[T]>;
    }
    let { body, renderHeader, renderBody }: Props = $props();
</script>

<table class="w-full bg-white">
    <thead class="border-b border-neutral-200 bg-neutral-100">
        <tr class="cursor-default">
            {@render renderHeader()}
        </tr>
    </thead>
    <tbody class="divide-y divide-neutral-200">
        {#each body as item}
            <tr class="cursor-default hover:bg-neutral-50">
                {@render renderBody(item)}
            </tr>
        {/each}
    </tbody>
</table>
