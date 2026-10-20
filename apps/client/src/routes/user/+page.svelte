<script lang="ts">
    import DefaultLayout from "$lib/components/layout/DefaultLayout.svelte";
    import SummaryPannel from "$lib/components/molecule/SummaryPannel.svelte";
    import TableCell from "$lib/components/atom/TableCell.svelte";
    import Badge from "$lib/components/atom/Badge.svelte";
    import Button from "$lib/components/atom/Button.svelte";
    import Modal from "$lib/components/atom/Modal.svelte";
    import { UserIcon } from "phosphor-svelte";
    import { openConfirm, openAlert } from "$lib/store/modal";
    import fetchApi from "$lib/utils";
    import { formatLocalDateOnly } from "$lib/utils/date.js";
    import type { UserResponse } from "@proval/types";
    import type { PageProps } from "./$types";

    let { data }: PageProps = $props();

    let userList = $state<UserResponse[]>(data.userList);
    let deletingIdSet = $state(new Set<string>());
    let selectedUser = $state<UserResponse | null>(null);
    let detailModalOpen = $state(false);

    $effect(() => {
        userList = data.userList;
    });

    const adminCount = $derived(userList.filter((user) => user.role === "admin").length);

    function formatJoinedLabel(value: string | Date): string {
        const date = value instanceof Date ? value : new Date(value);
        if (Number.isNaN(date.getTime())) {
            return `Joined ${String(value)}`;
        }
        return `Joined ${formatLocalDateOnly(date)}`;
    }

    function openUserDetail(user: UserResponse) {
        selectedUser = user;
        detailModalOpen = true;
    }

    function closeUserDetail() {
        detailModalOpen = false;
        selectedUser = null;
    }

    function isDeleteDisabled(user: UserResponse): boolean {
        if (user.id === data.auth.user?.id) {
            return true;
        }
        if (user.role === "admin" && adminCount <= 1) {
            return true;
        }
        return false;
    }

    async function onDelete(user: UserResponse) {
        const confirmed = await openConfirm(
            `This permanently removes ${user.email} from this Proval instance. This action cannot be undone.`,
            {
                title: "Remove User",
                confirmText: "Remove",
            },
        );
        if (!confirmed) {
            return;
        }
        deletingIdSet = new Set(deletingIdSet).add(user.id);
        try {
            const response = await fetchApi(`/user/${user.id}`, { method: "DELETE" });
            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                const message = typeof body.error === "string" ? body.error : "Failed to delete user";
                await openAlert(message);
                return;
            }
            userList = userList.filter((row) => row.id !== user.id);
            if (selectedUser?.id === user.id) {
                closeUserDetail();
            }
        } finally {
            const next = new Set(deletingIdSet);
            next.delete(user.id);
            deletingIdSet = next;
        }
    }
</script>

<DefaultLayout title="User">
    <div class="mb-4 grid max-w-md grid-cols-2 gap-3">
        <SummaryPannel label="Total User" value={userList.length} />
        <SummaryPannel label="Admin" value={adminCount} />
    </div>

    {#if userList.length === 0}
        <p class="text-sm text-muted-foreground">No users.</p>
    {:else}
        <div class="rounded-lg border border-border bg-card">
            <table
                class="w-full min-w-full border-separate border-spacing-0 [&_tbody_tr:first-child_td:first-child]:rounded-tl-lg [&_tbody_tr:first-child_td:last-child]:rounded-tr-lg [&_tbody_tr:last-child_td:first-child]:rounded-bl-lg [&_tbody_tr:last-child_td:last-child]:rounded-br-lg">
                <tbody class="[&_tr:not(:last-child)_td]:border-b [&_tr:not(:last-child)_td]:border-border">
                    {#each userList as user (user.id)}
                        <tr
                            class="cursor-pointer bg-card hover:bg-accent"
                            onclick={() => openUserDetail(user)}
                            onkeydown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    openUserDetail(user);
                                }
                            }}
                            tabindex="0"
                            role="button"
                            aria-label={`View ${user.email}`}>
                            <TableCell class="py-3">
                                <div class="flex min-w-0 items-center gap-2">
                                    <span
                                        class="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted select-none"
                                        aria-hidden="true">
                                        <UserIcon class="size-4 text-muted-foreground" weight="fill" />
                                    </span>
                                    <span class="min-w-0 truncate text-sm text-foreground">{user.email}</span>
                                    {#if user.role === "admin"}
                                        <Badge class="shrink-0 select-none" variant="primary">admin</Badge>
                                    {/if}
                                </div>
                            </TableCell>
                        </tr>
                    {/each}
                </tbody>
            </table>
        </div>
    {/if}
</DefaultLayout>

{#if selectedUser}
    <Modal bind:open={detailModalOpen} onclose={() => (selectedUser = null)} class="max-w-md">
        <h3 class="mb-4 text-lg font-semibold tracking-tight text-foreground">User</h3>
        <div class="space-y-3">
            <div class="flex min-w-0 items-center gap-2">
                <span
                    class="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted"
                    aria-hidden="true">
                    <UserIcon class="size-5 text-muted-foreground" weight="fill" />
                </span>
                <p class="min-w-0 truncate text-base font-medium text-foreground">{selectedUser.email}</p>
                {#if selectedUser.role === "admin"}
                    <Badge class="shrink-0" variant="primary">admin</Badge>
                {/if}
            </div>

            <p class="text-sm text-muted-foreground">{formatJoinedLabel(selectedUser.createdAt)}</p>
        </div>

        <div class="mt-6 flex items-center justify-between gap-3 border-t border-border pt-6">
            <Button
                text
                type="button"
                class="disabled:cursor-not-allowed"
                disabled={isDeleteDisabled(selectedUser) || deletingIdSet.has(selectedUser.id)}
                onclick={() => {
                    if (selectedUser) {
                        void onDelete(selectedUser);
                    }
                }}>
                Remove User
            </Button>
            <Button primary type="button" onclick={closeUserDetail}>Close</Button>
        </div>
    </Modal>
{/if}
