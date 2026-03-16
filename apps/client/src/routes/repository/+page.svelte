<script lang="ts">
    import TableCell from '$lib/components/atom/TableCell.svelte';
    import TableHeaderCell from '$lib/components/atom/TableHeaderCell.svelte';
    import Table from '$lib/components/organism/Table.svelte';
    import type { PageProps } from './$types';
    import GearIcon from 'phosphor-svelte/lib/GearIcon';
    import TrashIcon from 'phosphor-svelte/lib/TrashIcon';

    let { data }: PageProps = $props();
</script>

<div>
    <div>
        <h2 class="mb-4 text-xl font-semibold">Repository</h2>
    </div>
    <div class="overflow-hidden rounded-lg border border-neutral-200">
        <Table body={data.repositoryList}>
            {#snippet renderHeader()}
                <TableHeaderCell>ID</TableHeaderCell>
                <TableHeaderCell>Name</TableHeaderCell>
                <TableHeaderCell>Review Mode</TableHeaderCell>
                <TableHeaderCell>Reply Mode</TableHeaderCell>
                <TableHeaderCell>Language</TableHeaderCell>
                <TableHeaderCell>Updated At</TableHeaderCell>
                <TableHeaderCell>Actions</TableHeaderCell>
            {/snippet}
            {#snippet renderBody(repository)}
                <TableCell>{repository.id}</TableCell>
                <TableCell>{repository.name}</TableCell>
                <TableCell>{repository.reviewMode.replace('_', ' ')}</TableCell>
                <TableCell>{repository.replyMode.replace('_', ' ')}</TableCell>
                <TableCell>{repository.language}</TableCell>
                <TableCell>{repository.updatedAt.toLocaleString()}</TableCell>
                <TableCell>
                    <div class="flex items-center gap-2 text-center">
                        <a
                            class="transition-colors hover:text-neutral-400"
                            href={`/repository/${repository.id}`}
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
</div>
