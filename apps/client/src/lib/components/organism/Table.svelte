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

<div class="px-1.5">
    <table class="w-full text-sm">
        <thead class="border-b border-neutral-200 bg-neutral-50">
            <tr class="cursor-default">
                {@render renderHeader()}
            </tr>
        </thead>
        <tbody class="divide-y divide-neutral-200">
            {#each body as item}
                <tr class="cursor-defaulttransition-colors hover:bg-neutral-50">
                    {@render renderBody(item)}
                </tr>
            {/each}
        </tbody>
    </table>
</div>
