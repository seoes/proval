<script lang="ts">
    import Card from "$lib/components/layout/Card.svelte";
    import Button from "$lib/components/atom/Button.svelte";
    import Modal from "$lib/components/atom/Modal.svelte";
    import GitProviderIcon from "$lib/components/atom/GitProviderIcon.svelte";
    import GitHubAppForm from "./GitHubAppForm.svelte";
    import GitHubInstallationItem from "./GitHubInstallationItem.svelte";
    import { TrashIcon } from "phosphor-svelte";
    import fetchApi from "$lib/utils";
    import { openAlert, openConfirm } from "$lib/store/modal";
    import type { PageData } from "./$types";

    const {
        app,
        installationList,
    }: {
        app: PageData["app"];
        installationList: PageData["installationList"];
    } = $props();

    let registerModalOpen = $state(false);
    let registerFormKey = $state(0);
    let isDeletingApp = $state(false);
    let isAddingInstallation = $state(false);

    function openRegisterModal() {
        registerFormKey += 1;
        registerModalOpen = true;
    }

    function closeRegisterModal() {
        registerModalOpen = false;
    }

    function postManifestToGitHub(webhookUrl: string) {
        const normalizedWebhookUrl = webhookUrl.trim().replace(/\/$/, "");
        const clientOrigin = window.location.origin;
        const manifest = {
            name: `Proval-${crypto.randomUUID().replace(/-/g, "").slice(0, 6)}`,
            url: normalizedWebhookUrl,
            hook_attributes: {
                url: `${normalizedWebhookUrl}/webhook/github`,
                active: true,
            },
            redirect_url: `${clientOrigin}/provider/github/app/callback`,
            setup_url: `${clientOrigin}/provider/github/app/setup`,
            public: false,
            default_permissions: {
                contents: "read",
                metadata: "read",
                pull_requests: "write",
                issues: "write",
                statuses: "write",
            },
            default_events: ["pull_request", "issue_comment", "pull_request_review_comment"],
        };
        const formEl = document.createElement("form");
        formEl.method = "POST";
        formEl.action = "https://github.com/settings/apps/new";
        const manifestInput = document.createElement("input");
        manifestInput.type = "hidden";
        manifestInput.name = "manifest";
        manifestInput.value = JSON.stringify(manifest);
        const stateInput = document.createElement("input");
        stateInput.type = "hidden";
        stateInput.name = "state";
        stateInput.value = crypto.randomUUID();
        formEl.append(manifestInput, stateInput);
        document.body.appendChild(formEl);
        formEl.submit();
        formEl.remove();
    }

    function handleQuickSetup(webhookUrl: string) {
        closeRegisterModal();
        postManifestToGitHub(webhookUrl);
    }

    function handleAppSaved() {
        closeRegisterModal();
        window.location.reload();
    }

    async function deleteApp() {
        if (!app) return;
        if (!(await openConfirm("Delete this GitHub App? All connected accounts will be removed."))) {
            return;
        }
        isDeletingApp = true;
        try {
            const res = await fetchApi("/github/app", { method: "DELETE" });
            if (res.ok) {
                window.location.reload();
            } else {
                const err = await res.json();
                await openAlert(err.error || "Failed to delete app");
            }
        } catch {
            await openAlert("Failed to delete app");
        } finally {
            isDeletingApp = false;
        }
    }

    async function deleteInstallation(installationId: number) {
        if (!app) return;
        if (!(await openConfirm("Remove this connected account? This will also remove it from GitHub."))) {
            return;
        }
        try {
            const res = await fetchApi(`/github/app/${app.id}/installation/${installationId}`, {
                method: "DELETE",
            });
            if (res.ok) {
                window.location.reload();
            } else {
                const err = await res.json();
                await openAlert(err.error || "Failed to remove connected account");
            }
        } catch {
            await openAlert("Failed to remove connected account");
        }
    }

    async function getInstallUrl() {
        if (!app) return;
        const newWindow = window.open("", "_blank");
        if (!newWindow) {
            await openAlert("Popup blocked. Please allow popups for this site.");
            return;
        }
        isAddingInstallation = true;
        try {
            const res = await fetchApi(`/github/app/${app.id}/install-url`);
            if (res.ok) {
                const { url } = await res.json();
                newWindow.location.href = url;
            } else {
                const err = await res.json();
                newWindow.close();
                await openAlert(err.error || "Failed to connect GitHub account");
            }
        } catch {
            newWindow.close();
            await openAlert("Failed to connect GitHub account");
        } finally {
            isAddingInstallation = false;
        }
    }
</script>

<Card title="GitHub" border>
    {#if app}
        <div class="space-y-5">
            <div class="flex items-start justify-between gap-3">
                <div class="flex min-w-0 items-center gap-3">
                    <GitProviderIcon provider="github" boxed />
                    <div class="min-w-0">
                        <div class="flex items-center gap-2">
                            <p class="truncate font-medium text-neutral-800">{app.slug}</p>
                            <span
                                class="inline-flex items-center rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600 uppercase">
                                github
                            </span>
                        </div>
                        <p class="truncate text-sm text-neutral-500">App ID: {app.appId}</p>
                    </div>
                </div>
                <button
                    class="rounded p-1.5 text-neutral-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                    onclick={deleteApp}
                    disabled={isDeletingApp}>
                    <TrashIcon class="size-4" />
                </button>
            </div>

            <div class="border-t border-neutral-200 pt-4 dark:border-neutral-700">
                <h4 class="mb-3 text-sm font-medium text-neutral-700 dark:text-neutral-300">Connected Accounts</h4>
                {#if installationList.length > 0}
                    <div class="divide-y divide-neutral-200 dark:divide-neutral-700">
                        {#each installationList as installation (installation.id)}
                            <GitHubInstallationItem
                                {installation}
                                onDelete={() => deleteInstallation(installation.id)} />
                        {/each}
                    </div>
                    <div class="mt-8 flex items-center justify-center">
                        <Button text onclick={getInstallUrl} disabled={isAddingInstallation}>
                            {isAddingInstallation ? "Opening..." : "Connect GitHub account"}
                        </Button>
                    </div>
                {:else}
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-neutral-600">No connected accounts</p>
                            <p class="mt-1 text-sm text-neutral-400">
                                Connect a GitHub account or organization
                            </p>
                        </div>
                        <Button primary onclick={getInstallUrl} disabled={isAddingInstallation}>
                            {isAddingInstallation ? "Opening..." : "Connect GitHub account"}
                        </Button>
                    </div>
                {/if}
            </div>
        </div>
    {:else}
        <div class="space-y-4">
            <div class="flex items-center justify-between">
                <div>
                    <p class="text-neutral-600">No GitHub App configured</p>
                    <p class="mt-1 text-sm text-neutral-400">Register a GitHub App to connect repositories</p>
                </div>
            </div>
            <div class="mt-8 flex items-center justify-center">
                <Button text onclick={openRegisterModal}>Connect GitHub App</Button>
            </div>
        </div>
    {/if}
</Card>

<Modal bind:open={registerModalOpen} onclose={closeRegisterModal} class="max-w-md">
    {#key registerFormKey}
        <GitHubAppForm
            onCancel={closeRegisterModal}
            onQuickSetup={handleQuickSetup}
            onSaved={handleAppSaved} />
    {/key}
</Modal>
