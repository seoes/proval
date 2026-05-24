<script lang="ts">
    import Card from "$lib/components/layout/Card.svelte";
    import Button from "$lib/components/atom/Button.svelte";
    import InputText from "$lib/components/atom/InputText.svelte";
    import FormField from "$lib/components/molecule/FormField.svelte";
    import ToggleButton from "$lib/components/atom/ToggleButton.svelte";
    import { TrashIcon, GithubLogoIcon } from "phosphor-svelte";
    import fetchApi from "$lib/utils";
    import { openAlert, openConfirm } from "$lib/store/modal";
    import type { PageData } from "./$types";

    let {
        app,
        installationList,
    }: {
        app: PageData["app"];
        installationList: PageData["installationList"];
    } = $props();

    let isDeletingApp = $state(false);
    let isAddingInstallation = $state(false);
    let regMode = $state<"quick" | "manual">("quick");
    let isCreatingApp = $state(false);
    let webhookUrl = $state("");
    let manualAppId = $state("");
    let manualSlug = $state("");
    let manualPrivateKey = $state("");
    let manualWebhookSecret = $state("");

    async function deleteApp() {
        if (!app) return;
        if (!(await openConfirm("Delete this GitHub App? All installations will be removed."))) {
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
        if (!(await openConfirm("Delete this installation? This will also remove it from GitHub."))) {
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
                await openAlert(err.error || "Failed to delete installation");
            }
        } catch {
            await openAlert("Failed to delete installation");
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
                await openAlert(err.error || "Failed to get install URL");
            }
        } catch {
            newWindow.close();
            await openAlert("Failed to get install URL");
        } finally {
            isAddingInstallation = false;
        }
    }

    function normalizeBaseUrl(raw: string): string {
        const u = raw.trim().replace(/\/$/, "");
        try {
            new URL(u);
            return u;
        } catch {
            throw new Error("Invalid webhook URL");
        }
    }

    function postManifestToGitHub() {
        const normalizedWebhookUrl = normalizeBaseUrl(webhookUrl);
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
            default_events: ["pull_request", "issue_comment"],
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

    async function createAppQuick() {
        try {
            isCreatingApp = true;
            await openAlert("Complete GitHub App creation in the new tab, then return here and refresh.");
            postManifestToGitHub();
        } catch (e) {
            await openAlert(e instanceof Error ? e.message : "Invalid URL");
        } finally {
            isCreatingApp = false;
        }
    }

    async function createAppManual() {
        const appId = parseInt(manualAppId, 10);
        if (!Number.isFinite(appId) || !manualSlug.trim() || !manualPrivateKey.trim() || !manualWebhookSecret.trim()) {
            await openAlert("Fill in all fields: App ID, slug, private key, and webhook secret");
            return;
        }
        isCreatingApp = true;
        try {
            const res = await fetchApi("/github/app", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    appId,
                    slug: manualSlug.trim(),
                    privateKey: manualPrivateKey,
                    webhookSecret: manualWebhookSecret.trim(),
                }),
            });
            const body = await res.json();
            if (!res.ok) {
                await openAlert(body.error ?? "Registration failed");
                return;
            }
            window.location.reload();
        } catch {
            await openAlert("Failed to register app");
        } finally {
            isCreatingApp = false;
        }
    }
</script>

<Card title="GitHub" border>
    {#if app}
        <div class="space-y-5">
            <div class="flex items-center justify-between">
                <div class="flex items-center gap-3">
                    <div class="flex size-10 items-center justify-center rounded-lg bg-neutral-100">
                        <GithubLogoIcon class="size-5 text-neutral-600" />
                    </div>
                    <div>
                        <p class="font-medium text-neutral-800">{app.slug}</p>
                        <p class="text-sm text-neutral-500">App ID: {app.appId}</p>
                    </div>
                </div>
                <button
                    class="flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-4 py-2 text-sm text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                    onclick={deleteApp}
                    disabled={isDeletingApp}>
                    <TrashIcon class="size-4" />
                    {isDeletingApp ? "Deleting..." : "Delete"}
                </button>
            </div>

            <div class="border-t border-neutral-200 pt-4 dark:border-neutral-700">
                <h4 class="mb-3 text-sm font-medium text-neutral-700 dark:text-neutral-300">Installations</h4>
                {#if installationList.length > 0}
                    <div class="divide-y divide-neutral-200 dark:divide-neutral-700">
                        {#each installationList as installation}
                            <div class="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                                <div class="flex items-center gap-3">
                                    <div
                                        class="flex size-8 items-center justify-center rounded bg-neutral-100 text-sm font-medium text-neutral-600">
                                        {installation.accountType === "Organization" ? "O" : "U"}
                                    </div>
                                    <div>
                                        <p class="font-medium text-neutral-800">
                                            {installation.accountName || `Installation #${installation.installationId}`}
                                        </p>
                                        <p class="text-sm text-neutral-500">
                                            {installation.accountType}
                                        </p>
                                    </div>
                                </div>
                                <button
                                    class="rounded p-1.5 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600"
                                    onclick={() => deleteInstallation(installation.id)}>
                                    <TrashIcon class="size-4" />
                                </button>
                            </div>
                        {/each}
                    </div>
                    <div class="mt-4 flex items-center justify-center">
                        <Button text onclick={getInstallUrl} disabled={isAddingInstallation}>Add Installation</Button>
                    </div>
                {:else}
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-neutral-600">No installations found</p>
                            <p class="mt-1 text-sm text-neutral-400">
                                Install the app to your GitHub account or organization
                            </p>
                        </div>
                        <Button onclick={getInstallUrl} disabled={isAddingInstallation}>
                            {isAddingInstallation ? "Opening..." : "Add Installation"}
                        </Button>
                    </div>
                {/if}
            </div>
        </div>
    {:else}
        <div class="space-y-4">
            <p class="text-neutral-600">Register a GitHub App to enable integration with GitHub repositories.</p>

            <div class="flex flex-wrap gap-2">
                <ToggleButton
                    label="Quick setup"
                    description="Create via GitHub manifest"
                    selected={regMode === "quick"}
                    onclick={() => (regMode = "quick")}
                    class="min-w-36 flex-1" />
                <ToggleButton
                    label="Existing app"
                    description="Paste credentials from GitHub"
                    selected={regMode === "manual"}
                    onclick={() => (regMode = "manual")}
                    class="min-w-36 flex-1" />
            </div>

            {#if regMode === "manual"}
                <div class="space-y-4">
                    <FormField label="App ID" description="Numeric App ID from GitHub App settings">
                        {#snippet children({ id })}
                            <InputText {id} placeholder="123456" bind:value={manualAppId} />
                        {/snippet}
                    </FormField>
                    <FormField label="Slug" description="Short name of your GitHub App">
                        {#snippet children({ id })}
                            <InputText {id} placeholder="my-proval-app" bind:value={manualSlug} />
                        {/snippet}
                    </FormField>
                    <FormField label="Private key (PEM)" description="Generate from App settings">
                        {#snippet children({ id })}
                            <textarea
                                {id}
                                bind:value={manualPrivateKey}
                                rows="6"
                                class="mt-1 w-full rounded-xl border border-neutral-200 bg-gray-50 px-4 py-2 font-mono text-sm outline-none dark:border-neutral-700 dark:bg-neutral-800"
                                placeholder="-----BEGIN RSA PRIVATE KEY-----"></textarea>
                        {/snippet}
                    </FormField>
                    <FormField label="Webhook secret" description="From App settings — must match what GitHub sends">
                        {#snippet children({ id })}
                            <InputText {id} bind:value={manualWebhookSecret} password />
                        {/snippet}
                    </FormField>
                    <Button primary onclick={createAppManual} disabled={isCreatingApp}>
                        {isCreatingApp ? "Saving..." : "Save GitHub App"}
                    </Button>
                </div>
            {:else}
                <div class="space-y-4">
                    <FormField
                        label="Public webhook base URL"
                        description="Must be reachable by GitHub (e.g., your tunnel to port 7901)">
                        {#snippet children({ id })}
                            <InputText {id} placeholder="https://your-public-host:7901" bind:value={webhookUrl} />
                        {/snippet}
                    </FormField>
                    <Button primary onclick={createAppQuick} disabled={!webhookUrl || isCreatingApp}>
                        {isCreatingApp ? "Creating..." : "Connect GitHub App"}
                    </Button>
                </div>
            {/if}
        </div>
    {/if}
</Card>
