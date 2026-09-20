<script lang="ts" module>
    export type InfoStackItem = {
        label: string;
        value: string | number;
        error?: boolean;
        sublabel?: string;
        href?: string;
    };
</script>

<script lang="ts">
    interface Props {
        itemList: InfoStackItem[];
        sectionTitle?: string;
        class?: string;
    }

    const { itemList, sectionTitle, class: className = "" }: Props = $props();
</script>

<div class={className}>
    {#if sectionTitle}
        <div class="mb-3 pl-1">
            <h3 class="text-base font-medium text-neutral-800 dark:text-white">{sectionTitle}</h3>
        </div>
    {:else}
        <div class="mb-3 pl-1" aria-hidden="true">
            <h3 class="text-base font-medium invisible">&nbsp;</h3>
        </div>
    {/if}
    <div class="rounded-lg border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-800">
        <div class="divide-y divide-neutral-200 dark:divide-neutral-700">
            {#each itemList as item (item.label)}
                {#if item.href}
                    <a
                        href={item.href}
                        class="block px-4 py-3.5 transition-colors hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary dark:hover:bg-neutral-700/50">
                        <p class="text-sm text-neutral-500 dark:text-neutral-400">{item.label}</p>
                        <div class="mt-1.5 flex items-center gap-2">
                            {#if item.error}
                                <span
                                    class="size-2 shrink-0 rounded-full bg-red-500"
                                    aria-hidden="true"></span>
                            {/if}
                            <p class="text-xl font-semibold tracking-tight text-neutral-800 dark:text-neutral-100">
                                {item.value}
                            </p>
                        </div>
                        {#if item.sublabel}
                            <p class="mt-1 text-xs text-neutral-400">{item.sublabel}</p>
                        {/if}
                    </a>
                {:else}
                    <div class="px-4 py-3.5">
                        <p class="text-sm text-neutral-500 dark:text-neutral-400">{item.label}</p>
                        <div class="mt-1.5 flex items-center gap-2">
                            {#if item.error}
                                <span
                                    class="size-2 shrink-0 rounded-full bg-red-500"
                                    aria-hidden="true"></span>
                            {/if}
                            <p class="text-xl font-semibold tracking-tight text-neutral-800 dark:text-neutral-100">
                                {item.value}
                            </p>
                        </div>
                        {#if item.sublabel}
                            <p class="mt-1 text-xs text-neutral-400">{item.sublabel}</p>
                        {/if}
                    </div>
                {/if}
            {/each}
        </div>
    </div>
</div>
