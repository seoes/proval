<script lang="ts">
    import ModelCard from "$lib/components/molecule/ModelCard.svelte";
    import { PlusIcon } from "phosphor-svelte";
    import type { PageProps } from "./$types";
    import DefaultLayout from "$lib/components/layout/DefaultLayout.svelte";

    const { data }: PageProps = $props();
</script>

{#snippet addModelAction()}
    <a
        href="/model/create"
        class="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-neutral-900 hover:text-neutral-900/70 transition-colors ">
        <PlusIcon class="size-4" />
        Add Model
    </a>
{/snippet}

<DefaultLayout title="Model" actions={addModelAction}>
    {#if data.modelList.length === 0}
        <div class="rounded-lg border border-neutral-200 bg-white px-6 py-14 text-center">
            <p class="text-sm text-neutral-500">No models connected yet.</p>
            <a
                href="/model/create"
                class="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90">
                <PlusIcon class="size-4" />
                Add your first model
            </a>
        </div>
    {:else}
        <div class="space-y-3">
            {#each data.modelList as model (model.id)}
                <ModelCard {model} />
            {/each}
        </div>
    {/if}
</DefaultLayout>
