<script lang="ts">
    import TableHeaderCell from '$lib/components/atom/TableHeaderCell.svelte';
    import TableCell from '$lib/components/atom/TableCell.svelte';
    import Table from '$lib/components/organism/Table.svelte';
    import type { PageProps } from './$types';
    import { GearIcon, TrashIcon } from 'phosphor-svelte';

    let { data }: PageProps = $props();
</script>

<div>
    <div>
        <h2 class="mb-4 text-xl font-semibold">Model</h2>
    </div>
    <div class="overflow-hidden rounded-lg border border-neutral-200">
        <Table body={data.modelList}>
            {#snippet renderHeader()}
                <TableHeaderCell>ID</TableHeaderCell>
                <TableHeaderCell>Name</TableHeaderCell>
                <TableHeaderCell>Provider</TableHeaderCell>
                <TableHeaderCell>Model</TableHeaderCell>
                <TableHeaderCell>Base URL</TableHeaderCell>
                <TableHeaderCell>Updated At</TableHeaderCell>
                <TableHeaderCell>Config</TableHeaderCell>
            {/snippet}
            {#snippet renderBody(model)}
                <TableCell>{model.id}</TableCell>
                <TableCell>{model.label}</TableCell>
                <TableCell>{model.provider}</TableCell>
                <TableCell>{model.name}</TableCell>
                <TableCell>{model.baseUrl}</TableCell>
                <TableCell>{new Date(model.updatedAt).toLocaleString()}</TableCell>
                <TableCell>
                    <div class="flex items-center gap-2">
                        <a
                            class="transition-colors hover:text-neutral-400"
                            href={`/model/${model.id}`}
                        >
                            <GearIcon class="size-5" />
                        </a>
                        <button
                            class="cursor-pointer text-red-500 transition-colors hover:text-red-400"
                        >
                            <TrashIcon class="size-5" />
                        </button>
                    </div>
                </TableCell>
            {/snippet}
        </Table>
    </div>
    <div class="mt-4">
        <a
            href="/model/create"
            class="text-sm text-neutral-600 transition-colors hover:text-neutral-400">Add Model</a
        >
    </div>
</div>
