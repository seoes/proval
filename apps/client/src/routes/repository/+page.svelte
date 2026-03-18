<script lang="ts">
    import TableCell from '$lib/components/atom/TableCell.svelte';
    import TableHeaderCell from '$lib/components/atom/TableHeaderCell.svelte';
    import Table from '$lib/components/organism/Table.svelte';
    import { LockIcon, GearIcon, TrashIcon } from 'phosphor-svelte';
    import type { PageProps } from './$types';
    import DefaultLayout from '$lib/components/layout/DefaultLayout.svelte';
    import Modal from '$lib/components/atom/Modal.svelte';
    import PatchSecret from '$lib/components/molecule/PatchSecret.svelte';
    import Popover from '$lib/components/atom/Popover.svelte';
    import { formatTimeAgo } from '$lib/utils';

    let { data }: PageProps = $props();

    let selectedRepositoryId = $state<number | null>(null);
    let updateApiTokenModalOpen = $state(false);
    let updateWebhookSecretModalOpen = $state(false);
</script>

<DefaultLayout title="Repository">
    <div class="rounded-lg border border-neutral-200 bg-white p-4">
        <div class="relative overflow-visible rounded-lg border border-neutral-200 bg-neutral-50">
            <Table body={data.repositoryList}>
                {#snippet renderHeader()}
                    <TableHeaderCell>ID</TableHeaderCell>
                    <TableHeaderCell>Name</TableHeaderCell>
                    <TableHeaderCell>Review Mode</TableHeaderCell>
                    <TableHeaderCell>Reply Mode</TableHeaderCell>
                    <TableHeaderCell>Language</TableHeaderCell>
                    <TableHeaderCell>Updated</TableHeaderCell>
                    <TableHeaderCell>Actions</TableHeaderCell>
                {/snippet}
                {#snippet renderBody(repository)}
                    <TableCell>{repository.id}</TableCell>
                    <TableCell>{repository.name}</TableCell>
                    <TableCell>{repository.reviewMode.replace('_', ' ')}</TableCell>
                    <TableCell>{repository.replyMode.replace('_', ' ')}</TableCell>
                    <TableCell>{repository.language}</TableCell>
                    <TableCell>{formatTimeAgo(new Date(repository.updatedAt))}</TableCell>
                    <TableCell>
                        <div class="flex items-center gap-2 text-center">
                            <a
                                class="transition-colors hover:text-neutral-400"
                                href={`/repository/${repository.id}`}
                            >
                                <GearIcon class="size-5" />
                            </a>

                            <Popover
                                buttonList={[
                                    {
                                        label: 'Update API Token',
                                        onclick: () => {
                                            selectedRepositoryId = repository.id;
                                            updateApiTokenModalOpen = true;
                                        }
                                    },
                                    {
                                        label: 'Update Webhook Secret',
                                        onclick: () => {
                                            selectedRepositoryId = repository.id;
                                            updateWebhookSecretModalOpen = true;
                                        }
                                    }
                                ]}
                            >
                                <LockIcon class="size-5" />
                            </Popover>
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
                href="/repository/create"
                class="text-sm text-neutral-600 transition-colors hover:text-neutral-400"
            >
                Add Repository
            </a>
        </div>
    </div>
</DefaultLayout>
{#if selectedRepositoryId}
    <Modal bind:open={updateApiTokenModalOpen}>
        <PatchSecret
            label="Update API Token"
            description="Enter the API token to access repository"
            placeholder="glpat-..."
            patchEndpoint={`/repository/${selectedRepositoryId}/api-token`}
            onSuccess={() => (updateApiTokenModalOpen = false)}
        />
    </Modal>
    <Modal bind:open={updateWebhookSecretModalOpen}>
        <PatchSecret
            label="Update Webhook Secret"
            placeholder="secret"
            patchEndpoint={`/repository/${selectedRepositoryId}/webhook-secret`}
            onSuccess={() => (updateWebhookSecretModalOpen = false)}
        />
    </Modal>
{/if}
