<script lang="ts">
    import DefaultLayout from "$lib/components/layout/DefaultLayout.svelte";
    import Card from "$lib/components/layout/Card.svelte";
    import Button from "$lib/components/atom/Button.svelte";
    import Modal from "$lib/components/atom/Modal.svelte";
    import AccessItem from "./AccessItem.svelte";
    import AccessForm from "./AccessForm.svelte";
    import GitHubCard from "./GitHubCard.svelte";
    import fetchApi from "$lib/utils";
    import PatchSecret from "$lib/components/molecule/PatchSecret.svelte";
    import { openAlert, openConfirm } from "$lib/store/modal";
    import type { PageProps } from "./$types";
    import type { AccessProvider, AccessResponse } from "@proval/types";
    import { onMount } from "svelte";
    import { replaceState } from "$app/navigation";
    import { page } from "$app/state";

    const FLASH_SUCCESS_MESSAGES: Record<string, string> = {
        installation_added: "GitHub account connected.",
    };

    const FLASH_ERROR_MESSAGES: Record<string, string> = {
        missing_code: "GitHub authorization code was missing.",
        missing_slug: "GitHub App registration completed without an app slug.",
        missing_installation_id: "GitHub account connection was incomplete.",
        invalid_setup_action: "Invalid GitHub account connection action.",
        app_creation_failed: "Failed to register the GitHub App.",
        installation_failed: "Failed to connect the GitHub account.",
    };

    let { data }: PageProps = $props();

    // Access states
    let accessList = $state<AccessResponse[]>(data.accessList);
    let showModal = $state(false);
    let accessFormKey = $state(0);
    let editingId = $state<number | null>(null);
    let isSavingAccess = $state(false);
    let isTestingId = $state<number | null>(null);
    let testResult = $state<{ id: number; success: boolean; message: string } | null>(null);

    let formProvider = $state<AccessProvider>("gitlab");
    let formName = $state("");
    let formBaseUrl = $state("");
    let formAccessToken = $state("");

    let updateAccessTokenModalOpen = $state(false);
    let selectedAccessId = $state<number | null>(null);
    let selectedAccessProvider = $state<AccessProvider | null>(null);

    onMount(async () => {
        const success = page.url.searchParams.get("success");
        const error = page.url.searchParams.get("error");
        if (!success && !error) {
            return;
        }

        if (success) {
            await openAlert(FLASH_SUCCESS_MESSAGES[success] ?? "Success.");
        } else if (error) {
            await openAlert(FLASH_ERROR_MESSAGES[error] ?? error);
        }

        replaceState("/provider", {});
    });

    // Access functions
    function openAddModal(provider: AccessProvider) {
        accessFormKey += 1;
        editingId = null;
        formProvider = provider;
        formName = "";
        formBaseUrl = "";
        formAccessToken = "";
        testResult = null;
        showModal = true;
    }

    function openEditForm(item: AccessResponse) {
        accessFormKey += 1;
        editingId = item.id;
        formProvider = item.provider;
        formName = item.name;
        formBaseUrl = item.baseUrl;
        formAccessToken = "";
        testResult = null;
        showModal = true;
    }

    function closeAccessModal() {
        showModal = false;
        editingId = null;
        testResult = null;
    }

    async function saveAccess() {
        if (!formName.trim() || !formBaseUrl.trim()) {
            await openAlert("Name and base URL are required");
            return;
        }
        if (editingId === null && !formAccessToken.trim()) {
            await openAlert("Access token is required");
            return;
        }
        isSavingAccess = true;
        try {
            if (editingId !== null) {
                const payload = {
                    name: formName.trim(),
                    baseUrl: formBaseUrl.trim(),
                };
                const res = await fetchApi(`/access/${editingId}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });
                if (!res.ok) {
                    const body = await res.json().catch(() => ({}));
                    await openAlert(body.error || "Failed to update access");
                    return;
                }
                const result = await res.json();
                accessList = accessList.map((a) => (a.id === editingId ? { ...a, ...result } : a));
            } else {
                const payload = {
                    provider: formProvider,
                    name: formName.trim(),
                    baseUrl: formBaseUrl.trim(),
                    accessToken: formAccessToken,
                };
                const res = await fetchApi("/access", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });
                if (!res.ok) {
                    const body = await res.json().catch(() => ({}));
                    await openAlert(body.error || "Failed to create access");
                    return;
                }
                const result = await res.json();
                accessList.push(result);
            }
            closeAccessModal();
        } catch {
            await openAlert("Failed to save access");
        } finally {
            isSavingAccess = false;
        }
    }

    async function deleteAccess(id: number) {
        if (!(await openConfirm("Delete this access configuration? Repositories using it may break."))) {
            return;
        }
        try {
            const res = await fetchApi(`/access/${id}`, { method: "DELETE" });
            if (res.ok) {
                accessList = accessList.filter((a) => a.id !== id);
            } else {
                const body = await res.json().catch(() => ({}));
                await openAlert(body.error || "Failed to delete access");
            }
        } catch {
            await openAlert("Failed to delete access");
        }
    }

    async function testAccess(id: number) {
        isTestingId = id;
        testResult = null;
        try {
            const res = await fetchApi(`/access/${id}/test`, { method: "POST" });
            const body = await res.json().catch(() => ({ success: false, message: "Unknown error" }));
            testResult = { id, success: body.success, message: body.message };
        } catch {
            testResult = { id, success: false, message: "Request failed" };
        } finally {
            isTestingId = null;
        }
    }

    const gitlabList = $derived(accessList.filter((a) => a.provider === "gitlab"));
    const forgejoList = $derived(accessList.filter((a) => a.provider === "forgejo"));

    function openUpdateAccessTokenModal(item: AccessResponse) {
        selectedAccessId = item.id;
        selectedAccessProvider = item.provider;
        updateAccessTokenModalOpen = true;
    }

    function closeUpdateAccessTokenModal() {
        updateAccessTokenModalOpen = false;
        selectedAccessId = null;
        selectedAccessProvider = null;
    }

    const patchSecretTokenPlaceholder = $derived(
        selectedAccessProvider === "forgejo" ? "Forgejo personal access token" : "glpat-xxxxxxxxxxxxxxxxxxxx",
    );
    const patchSecretTokenDescription = $derived(
        selectedAccessProvider === "forgejo"
            ? "Personal access token with API scope (e.g. read_api, write_repository)"
            : "Personal or project token with api scope",
    );
</script>

<DefaultLayout title="Git Provider">
    <div class="space-y-6">
        <!-- GitLab Access Card -->
        <Card title="GitLab" border>
            <div class="space-y-4">
                {#if gitlabList.length > 0}
                    <div class="divide-y divide-neutral-200 dark:divide-neutral-700">
                        {#each gitlabList as item (item.id)}
                            <AccessItem
                                {item}
                                {testResult}
                                isTesting={isTestingId === item.id}
                                onTest={() => testAccess(item.id)}
                                onUpdateToken={() => openUpdateAccessTokenModal(item)}
                                onEdit={() => openEditForm(item)}
                                onDelete={() => deleteAccess(item.id)} />
                        {/each}
                    </div>
                {:else}
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-neutral-600">No GitLab access configurations</p>
                            <p class="mt-1 text-sm text-neutral-400">
                                Add a GitLab access token to connect repositories
                            </p>
                        </div>
                    </div>
                {/if}

                <div class="mt-8 flex items-center justify-center gap-2">
                    <Button text onclick={() => openAddModal("gitlab")}>Add GitLab connection</Button>
                </div>
            </div>
        </Card>

        <!-- Forgejo Access Card -->
        <Card title="Forgejo" border>
            <div class="space-y-4">
                {#if forgejoList.length > 0}
                    <div class="divide-y divide-neutral-200 dark:divide-neutral-700">
                        {#each forgejoList as item (item.id)}
                            <AccessItem
                                {item}
                                {testResult}
                                isTesting={isTestingId === item.id}
                                onTest={() => testAccess(item.id)}
                                onUpdateToken={() => openUpdateAccessTokenModal(item)}
                                onEdit={() => openEditForm(item)}
                                onDelete={() => deleteAccess(item.id)} />
                        {/each}
                    </div>
                {:else}
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-neutral-600">No Forgejo access configurations</p>
                            <p class="mt-1 text-sm text-neutral-400">
                                Add a Forgejo access token to connect repositories
                            </p>
                        </div>
                    </div>
                {/if}

                <div class="mt-8 flex items-center justify-center gap-2">
                    <Button text onclick={() => openAddModal("forgejo")}>Add Forgejo connection</Button>
                </div>
            </div>
        </Card>

        <GitHubCard app={data.app} installationList={data.installationList} />
    </div>

    <!-- Add/Edit Modal -->
    <Modal bind:open={showModal} onclose={closeAccessModal}>
        {#key accessFormKey}
            <AccessForm
                bind:formProvider
                bind:formName
                bind:formBaseUrl
                bind:formAccessToken
                {editingId}
                {isSavingAccess}
                onSubmit={saveAccess}
                onCancel={closeAccessModal} />
        {/key}
    </Modal>

    <!-- Update Access Token Modal -->
    <Modal bind:open={updateAccessTokenModalOpen} onclose={closeUpdateAccessTokenModal}>
        {#if selectedAccessId !== null && selectedAccessProvider !== null}
            <PatchSecret
                label="Update Access Token"
                description={patchSecretTokenDescription}
                placeholder={patchSecretTokenPlaceholder}
                patchEndpoint={`/access/${selectedAccessId}/access-token`}
                onSuccess={closeUpdateAccessTokenModal} />
        {/if}
    </Modal>
</DefaultLayout>
