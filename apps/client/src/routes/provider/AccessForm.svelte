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
        isSavingAccess,
        onSubmit,
        onCancel,
    }: {
        formProvider: AccessProvider;
        formName: string;
        formBaseUrl: string;
        formAccessToken: string;
        isSavingAccess: boolean;
        onSubmit: () => void;
        onCancel: () => void;
    } = $props();

    let isTesting = $state(false);
    let testResult = $state<{ success: boolean; message: string } | null>(null);

    const title = $derived(
        formProvider === "gitlab"
            ? "Add GitLab connection"
            : formProvider === "gitea"
              ? "Add Gitea connection"
              : "Add Forgejo connection",
    );

    const accessFormNamePlaceholder = $derived(
        formProvider === "gitlab"
            ? "Production GitLab"
            : formProvider === "gitea"
              ? "Production Gitea"
              : "Team Forgejo",
    );
    const accessFormBaseUrlPlaceholder = $derived(
        formProvider === "gitlab"
            ? "https://gitlab.example.com"
            : formProvider === "gitea"
              ? "https://gitea.example.com"
              : "https://forgejo.example.com",
    );
    const accessFormTokenPlaceholder = $derived(
        formProvider === "gitlab"
            ? "glpat-xxxxxxxxxxxxxxxxxxxx"
            : formProvider === "gitea"
              ? "Gitea personal access token"
              : "Forgejo personal access token",
    );
    const accessFormTokenDescription = $derived(
        formProvider === "gitlab"
            ? "Personal access token with api scope (Not project access token)"
            : formProvider === "gitea"
              ? "Personal access token with API scope (e.g. read_api, write_repository)"
              : "Personal access token with API scope (e.g. read_api, write_repository)",
    );
    const accessFormBaseUrlDescription = $derived(
        formProvider === "gitlab"
            ? "Root URL of your GitLab instance"
            : formProvider === "gitea"
              ? "Root URL of your Gitea instance"
              : "Root URL of your Forgejo instance",
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

<h3 class="mb-4 text-lg font-semibold tracking-tight">
    {title}
</h3>
<div class="space-y-4">
    <Select
        label="Provider"
        bind:value={formProvider}
        options={[
            { value: "gitlab", label: "GitLab", description: "Self hosted GitLab" },
            { value: "forgejo", label: "Forgejo", description: "Forgejo or Codeberg" },
            { value: "gitea", label: "Gitea", description: "Self hosted Gitea" },
        ]} />
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
    <FormField label="Access token" description={accessFormTokenDescription}>
        {#snippet children({ id })}
            <InputText {id} placeholder={accessFormTokenPlaceholder} bind:value={formAccessToken} password />
        {/snippet}
    </FormField>
    {#if testResult}
        <div
            class="flex items-center gap-2 rounded-lg px-3 py-2 text-sm {testResult.success
                ? 'bg-success-muted text-success'
                : 'bg-destructive-muted text-destructive'}">
            <span class="font-medium">{testResult.success ? "Connected" : "Failed"}:</span>
            {testResult.message}
        </div>
    {/if}
    <div class="flex justify-between gap-3 pt-2">
        <div class="flex gap-3">
            <Button primary onclick={onSubmit} disabled={isSavingAccess}>
                {isSavingAccess ? "Saving..." : "Create"}
            </Button>
            <Button text onclick={onCancel} disabled={isSavingAccess}>Cancel</Button>
        </div>
        <div>
            <Button text onclick={testConnection} disabled={isTesting || isSavingAccess}>
                {isTesting ? "Testing..." : "Test Connection"}
            </Button>
        </div>
    </div>
</div>
