<script lang="ts">
    import TableHeaderCell from '$lib/components/atom/TableHeaderCell.svelte';
    import TableCell from '$lib/components/atom/TableCell.svelte';
    import Table from '$lib/components/organism/Table.svelte';
    import { GearIcon, LockIcon } from 'phosphor-svelte';
    import type { PageProps } from './$types';
    import DefaultLayout from '$lib/components/layout/DefaultLayout.svelte';
    import Popover from '$lib/components/atom/Popover.svelte';
    import Modal from '$lib/components/atom/Modal.svelte';
    import PatchSecret from '$lib/components/molecule/PatchSecret.svelte';
    import { formatTimeAgo } from '$lib/utils';

    let { data }: PageProps = $props();

    let updateApiKeyModalOpen = $state(false);
    let selectedModelId = $state<number | null>(null);
</script>

<DefaultLayout title="Model">
    <div class="rounded-lg border border-neutral-200 bg-white p-4">
        <div class="overflow-visible rounded-lg border border-neutral-200">
            <Table body={data.modelList}>
                {#snippet renderHeader()}
                    <TableHeaderCell>ID</TableHeaderCell>
                    <TableHeaderCell>Name</TableHeaderCell>
                    <TableHeaderCell>Provider</TableHeaderCell>
                    <TableHeaderCell>Model</TableHeaderCell>
                    <TableHeaderCell>Base URL</TableHeaderCell>
                    <TableHeaderCell>Updated</TableHeaderCell>
                    <TableHeaderCell>Config</TableHeaderCell>
                {/snippet}
                {#snippet renderBody(model)}
                    <TableCell>{model.id}</TableCell>
                    <TableCell>{model.label}</TableCell>
                    <TableCell>{model.provider}</TableCell>
                    <TableCell>{model.name}</TableCell>
                    <TableCell>{model.baseUrl}</TableCell>
                    <TableCell>{formatTimeAgo(new Date(model.updatedAt))}</TableCell>
                    <TableCell>
                        <div class="flex items-center gap-2">
                            <a
                                class="transition-colors hover:text-neutral-400"
                                href={`/model/${model.id}`}
                            >
                                <GearIcon class="size-5" />
                            </a>
                            <Popover
                                buttonList={[
                                    {
                                        label: 'Update API Key',
                                        onclick: () => {
                                            selectedModelId = model.id;
                                            updateApiKeyModalOpen = true;
                                        }
                                    }
                                ]}
                            >
                                <LockIcon class="size-5" />
                            </Popover>
                        </div>
                    </TableCell>
                {/snippet}
            </Table>
        </div>
        <div class="mt-4">
            <a
                href="/model/create"
                class="text-sm text-neutral-600 transition-colors hover:text-neutral-400"
                >Add Model</a
            >
        </div>
    </div>
</DefaultLayout>

{#if selectedModelId}
    <Modal bind:open={updateApiKeyModalOpen}>
        <PatchSecret
            label="Update API key"
            placeholder="sk-..."
            patchEndpoint={`/model/${selectedModelId}/api-key`}
            onSuccess={() => {
                updateApiKeyModalOpen = false;
            }}
        />
    </Modal>
{/if}
