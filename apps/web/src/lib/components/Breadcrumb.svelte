<script lang="ts">
    type Crumb = {
        name: string;
        href?: string;
    };

    interface Props {
        items: readonly Crumb[];
        class?: string;
    }

    let { items, class: className = "" }: Props = $props();
</script>

<nav aria-label="Breadcrumb" class={["text-sm text-neutral-500", className].filter(Boolean).join(" ")}>
    <ol class="flex flex-wrap items-center gap-1.5">
        {#each items as item, index (item.name + String(index))}
            <li class="inline-flex items-center gap-1.5">
                {#if index > 0}
                    <span class="text-neutral-300" aria-hidden="true">/</span>
                {/if}
                {#if item.href && index < items.length - 1}
                    <a href={item.href} class="font-medium transition-colors hover:text-neutral-900">{item.name}</a>
                {:else}
                    <span class="font-medium text-neutral-700" aria-current="page">{item.name}</span>
                {/if}
            </li>
        {/each}
    </ol>
</nav>
