<script lang="ts">
    import RepositoryCard from "$lib/components/molecule/RepositoryCard.svelte";
    import { PlusIcon } from "phosphor-svelte";
    import type { PageProps } from "./$types";
    import DefaultLayout from "$lib/components/layout/DefaultLayout.svelte";

    const { data }: PageProps = $props();
</script>

{#snippet addRepositoryAction()}
    <a
        href="/repository/create"
        class="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors text-neutral-900 hover:text-neutral-900/70">
        <PlusIcon class="size-4" />
        Add Repository
    </a>
{/snippet}

<DefaultLayout title="Repository" actions={addRepositoryAction}>
    {#if data.repositoryList.length === 0}
        <div class="rounded-lg border border-neutral-200 bg-white px-6 py-14 text-center">
            <p class="text-sm text-neutral-500">No repositories connected yet.</p>
            <a
                href="/repository/create"
                class="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90">
                <PlusIcon class="size-4" />
                Add your first repository
            </a>
        </div>
    {:else}
        <div class="space-y-3">
            {#each data.repositoryList as repository (repository.id)}
                <RepositoryCard {repository} />
            {/each}
        </div>
    {/if}
</DefaultLayout>
