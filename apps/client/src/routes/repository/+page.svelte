<script lang="ts">
    import TableCell from "$lib/components/atom/TableCell.svelte";
    import TableHeaderCell from "$lib/components/atom/TableHeaderCell.svelte";
    import Table from "$lib/components/organism/Table.svelte";
    import { GearIcon } from "phosphor-svelte";
    import type { PageProps } from "./$types";
    import DefaultLayout from "$lib/components/layout/DefaultLayout.svelte";
    import { formatTimeAgo } from "$lib/utils";

    let { data }: PageProps = $props();
</script>

<DefaultLayout title="Repository">
    <div class="rounded-lg border border-neutral-200 bg-white p-4">
        <Table body={data.repositoryList}>
                {#snippet renderHeader()}
                    <TableHeaderCell>ID</TableHeaderCell>
                    <TableHeaderCell>Name</TableHeaderCell>
                    <TableHeaderCell>Review on MR open</TableHeaderCell>
                    <TableHeaderCell>MR replies</TableHeaderCell>
                    <TableHeaderCell>Issue replies</TableHeaderCell>
                    <TableHeaderCell>Language</TableHeaderCell>
                    <TableHeaderCell>Updated</TableHeaderCell>
                    <TableHeaderCell>Actions</TableHeaderCell>
                {/snippet}
                {#snippet renderBody(repository)}
                    <TableCell>{repository.id}</TableCell>
                    <TableCell>{repository.name}</TableCell>
                    <TableCell>{repository.reviewOnMergeRequestOpen ? "Yes" : "No"}</TableCell>
                    <TableCell>{repository.replyToMergeRequestComment.replace(/_/g, " ")}</TableCell>
                    <TableCell>{repository.replyToIssueComment.replace(/_/g, " ")}</TableCell>
                    <TableCell>{repository.language}</TableCell>
                    <TableCell>{formatTimeAgo(new Date(repository.updatedAt))}</TableCell>
                    <TableCell>
                        <div class="flex items-center gap-2 text-center">
                            <a class="transition-colors hover:text-neutral-400" href={`/repository/${repository.id}`}>
                                <GearIcon class="size-5" />
                            </a>
                        </div>
                    </TableCell>
                {/snippet}
        </Table>
        <div class="mt-4">
            <a href="/repository/create" class="text-sm text-neutral-600 transition-colors hover:text-neutral-400">
                Add Repository
            </a>
        </div>
    </div>
</DefaultLayout>
