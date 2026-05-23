<!-- eslint-disable @typescript-eslint/no-explicit-any -->
<script lang="ts" generics="T extends Record<string, any>">
    import type { Snippet } from "svelte";

    interface Props {
        body: T[];
        renderHeader: Snippet<[]>;
        renderBody: Snippet<[T]>;
    }
    let { body, renderHeader, renderBody }: Props = $props();
</script>

<div class="rounded-lg border border-neutral-200 bg-white">
    <table
        class="w-full min-w-full border-separate border-spacing-0 [&_tbody_tr:last-child_td:first-child]:rounded-bl-lg [&_tbody_tr:last-child_td:last-child]:rounded-br-lg [&_thead_th:first-child]:rounded-tl-lg [&_thead_th:last-child]:rounded-tr-lg"
    >
        <thead>
            <tr class="bg-neutral-100">
                {@render renderHeader()}
            </tr>
        </thead>
        <tbody class="[&_tr:not(:last-child)_td]:border-b [&_tr:not(:last-child)_td]:border-neutral-200">
            {#each body as item}
                <tr class="bg-white hover:bg-neutral-50">
                    {@render renderBody(item)}
                </tr>
            {/each}
        </tbody>
    </table>
</div>
