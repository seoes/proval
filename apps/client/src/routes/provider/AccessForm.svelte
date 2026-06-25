<script lang="ts">
    import Button from "$lib/components/atom/Button.svelte";
    import InputText from "$lib/components/atom/InputText.svelte";
    import FormField from "$lib/components/molecule/FormField.svelte";
    import Select from "$lib/components/atom/Select.svelte";
    import fetchApi from "$lib/utils";
    import { openAlert } from "$lib/store/modal";
    import type { AccessProvider } from "@proval/types";

    let {
        formProvider = $bindable<AccessProvider>(),
        formName = $bindable(""),
        formBaseUrl = $bindable(""),
        formAccessToken = $bindable(""),
        editingId,
        isSavingAccess,
        onSubmit,
        onCancel,
    }: {
        formProvider: AccessProvider;
        formName: string;
        formBaseUrl: string;
        formAccessToken: string;
        editingId: number | null;
        isSavingAccess: boolean;
        onSubmit: () => void;
        onCancel: () => void;
    } = $props();

    let isTesting = $state(false);
    let testResult = $state<{ success: boolean; message: string } | null>(null);

    const title = $derived(
        editingId !== null
            ? "Edit Access"
            : formProvider === "gitlab"
              ? "Add GitLab connection"
              : "Add Forgejo connection",
    );

    const accessFormNamePlaceholder = $derived(formProvider === "gitlab" ? "Production GitLab" : "Team Forgejo");
    const accessFormBaseUrlPlaceholder = $derived(
        formProvider === "gitlab" ? "https://gitlab.example.com" : "https://forgejo.example.com",
    );
    const accessFormTokenPlaceholder = $derived(
        formProvider === "gitlab" ? "glpat-xxxxxxxxxxxxxxxxxxxx" : "Forgejo personal access token",
    );
    const accessFormTokenDescription = $derived(
        formProvider === "gitlab"
            ? "Personal access token with api scope (Not project access token)"
            : "Personal access token with API scope (e.g. read_api, write_repository)",
    );
    const accessFormBaseUrlDescription = $derived(
        formProvider === "gitlab" ? "Root URL of your GitLab instance" : "Root URL of your Forgejo instance",
    );

    async function testConnection() {
        if (!formBaseUrl.trim() || !formAccessToken.trim()) {
            await openAlert("Base URL and access token are required to test");
            return;
        }
        isTesting = true;
        testResult = null;
        try {
            const res = await fetchApi("/access/test", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    provider: formProvider,
                    baseUrl: formBaseUrl.trim(),
                    accessToken: formAccessToken,
                }),
            });
            const body = await res.json().catch(() => ({ success: false, message: "Unknown error" }));
            testResult = { success: body.success, message: body.message ?? body.error ?? "Unknown error" };
        } catch {
            testResult = { success: false, message: "Request failed" };
        } finally {
            isTesting = false;
        }
    }
</script>

<h3 class="mb-4 text-lg font-semibold tracking-tight dark:text-neutral-50">
    {title}
</h3>
<div class="space-y-4">
    <FormField label="Provider">
        {#snippet children({ id })}
            <Select
                {id}
                options={[
                    { value: "gitlab", label: "GitLab" },
                    { value: "forgejo", label: "Forgejo" },
                ]}
                value={formProvider}
                disabled={editingId !== null}
                onchange={(e) => (formProvider = (e.target as HTMLSelectElement).value as AccessProvider)} />
        {/snippet}
    </FormField>
    <FormField label="Name" description="A friendly label for this connection">
        {#snippet children({ id })}
            <InputText {id} placeholder={accessFormNamePlaceholder} bind:value={formName} />
        {/snippet}
    </FormField>
    <FormField label="Base URL" description={accessFormBaseUrlDescription}>
        {#snippet children({ id })}
            <InputText {id} placeholder={accessFormBaseUrlPlaceholder} bind:value={formBaseUrl} />
        {/snippet}
    </FormField>
    {#if editingId === null}
        <FormField label="Access token" description={accessFormTokenDescription}>
            {#snippet children({ id })}
                <InputText {id} placeholder={accessFormTokenPlaceholder} bind:value={formAccessToken} password />
            {/snippet}
        </FormField>
    {/if}
    {#if editingId === null && testResult}
        <div
            class="flex items-center gap-2 rounded-lg px-3 py-2 text-sm {testResult.success
                ? 'bg-emerald-50 text-emerald-700'
                : 'bg-red-50 text-red-700'}">
            <span class="font-medium">{testResult.success ? "Connected" : "Failed"}:</span>
            {testResult.message}
        </div>
    {/if}
    <div class="mt-8 flex justify-between">
        <div class="flex gap-4">
            <Button primary onclick={onSubmit} disabled={isSavingAccess} class="w-auto">
                {isSavingAccess ? "Saving..." : editingId !== null ? "Update" : "Create"}
            </Button>
            <Button text onclick={onCancel} disabled={isSavingAccess} class="w-auto">Cancel</Button>
        </div>
        <div class="h-full">
            {#if editingId === null}
                <Button
                    text
                    onclick={testConnection}
                    disabled={isTesting || isSavingAccess}
                    class="h-11 w-auto px-0 py-0">
                    {isTesting ? "Testing..." : "Test Connection"}
                </Button>
            {/if}
        </div>
    </div>
</div>
