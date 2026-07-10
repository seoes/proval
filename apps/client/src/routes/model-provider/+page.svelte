<script lang="ts">
    import ResourceCard from "$lib/components/molecule/ResourceCard.svelte";
    import Badge from "$lib/components/atom/Badge.svelte";
    import Button from "$lib/components/atom/Button.svelte";
    import { PlusIcon } from "phosphor-svelte";
    import { modelProviderLabel, truncateUrl } from "$lib/utils/label";
    import type { PageProps } from "./$types";
    import DefaultLayout from "$lib/components/layout/DefaultLayout.svelte";

    const { data }: PageProps = $props();
</script>

{#snippet addModelProviderAction()}
    <Button href="/model-provider/create" size="sm" class="gap-1.5 text-neutral-900 hover:text-neutral-900/70">
        <PlusIcon class="size-4" />
        Add Model Provider
    </Button>
{/snippet}

<DefaultLayout title="Model Provider" actions={addModelProviderAction}>
    {#if data.modelProviderList.length === 0}
        <div class="rounded-lg border border-neutral-200 bg-white px-6 py-14 text-center">
            <p class="text-sm text-neutral-500">No model providers connected yet.</p>
            <Button primary href="/model-provider/create" size="sm" class="mt-4 gap-1.5">
                <PlusIcon class="size-4" />
                Add your first model provider
            </Button>
        </div>
    {:else}
        <div class="space-y-3">
            {#each data.modelProviderList as modelProvider (modelProvider.id)}
                {#snippet header()}
                    <div class="ml-1.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                        <span class="truncate text-sm text-neutral-800">{modelProvider.label}</span>
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
