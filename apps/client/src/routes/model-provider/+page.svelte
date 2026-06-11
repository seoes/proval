<script lang="ts">
    import ResourceCard from "$lib/components/molecule/ResourceCard.svelte";
    import Badge from "$lib/components/atom/Badge.svelte";
    import { PlusIcon } from "phosphor-svelte";
    import { modelProviderLabel, truncateUrl } from "$lib/utils/label";
    import type { PageProps } from "./$types";
    import DefaultLayout from "$lib/components/layout/DefaultLayout.svelte";

    const { data }: PageProps = $props();
</script>

{#snippet addModelProviderAction()}
    <a
        href="/model-provider/create"
        class="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-neutral-900 transition-colors hover:text-neutral-900/70">
        <PlusIcon class="size-4" />
        Add Model Provider
    </a>
{/snippet}

<DefaultLayout title="Model Provider" actions={addModelProviderAction}>
    {#if data.modelProviderList.length === 0}
        <div class="rounded-lg border border-neutral-200 bg-white px-6 py-14 text-center">
            <p class="text-sm text-neutral-500">No model providers connected yet.</p>
            <a
                href="/model-provider/create"
                class="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90">
                <PlusIcon class="size-4" />
                Add your first model provider
            </a>
        </div>
    {:else}
        <div class="space-y-3">
            {#each data.modelProviderList as modelProvider (modelProvider.id)}
                {#snippet header()}
                    <div class="ml-1.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                        <span class="truncate text-neutral-800">{modelProvider.label}</span>
                    </div>
                {/snippet}
                {#snippet badge()}
                    <Badge variant="primary">{modelProviderLabel(modelProvider.provider)}</Badge>
                    <Badge variant="neutral">{truncateUrl(modelProvider.baseUrl)}</Badge>
                {/snippet}
                <ResourceCard href="/model-provider/{modelProvider.id}" {header} {badge} />
            {/each}
        </div>
    {/if}
</DefaultLayout>
