<script lang="ts">
    import Button from "$lib/components/atom/Button.svelte";
    import InputText from "$lib/components/atom/InputText.svelte";
    import FormField from "$lib/components/molecule/FormField.svelte";
    import SimpleSelectCard from "$lib/components/atom/SimpleSelectCard.svelte";
    import Description from "$lib/components/atom/Description.svelte";
    import fetchApi from "$lib/utils";
    import { openAlert } from "$lib/store/modal";

    type RegMode = "quick" | "manual";
    type Step = "mode" | "quick" | "manual";

    let {
        onCancel,
        onQuickSetup,
        onSaved,
    }: {
        onCancel: () => void;
        onQuickSetup: (webhookUrl: string) => void;
        onSaved: () => void;
    } = $props();

    let step = $state<Step>("mode");
    let regMode = $state<RegMode>("quick");

    let webhookUrl = $state("");
    let manualAppId = $state("");
    let manualSlug = $state("");
    let manualPrivateKey = $state("");
    let manualWebhookSecret = $state("");
    let manualBaseUrl = $state("");

    let isTesting = $state(false);
    let isSaving = $state(false);
    let testResult = $state<{ success: boolean; message: string } | null>(null);

    const modeOptionList = [
        { value: "quick" as const, label: "Quick setup", description: "Create via GitHub manifest" },
        { value: "manual" as const, label: "Existing app", description: "Paste credentials from GitHub App settings" },
    ];

    const title = $derived(
        step === "mode"
            ? "Connect GitHub App"
            : step === "quick"
              ? "Quick setup"
              : "Existing app",
    );

    const normalizedManualBaseUrl = $derived.by(() => {
        const raw = manualBaseUrl.trim().replace(/\/$/, "");
        if (!raw) return "";
        try {
            new URL(raw);
            return raw;
        } catch {
            return "";
        }
    });

    const webhookPreview = $derived.by(() => {
        const raw = webhookUrl.trim().replace(/\/$/, "");
        if (!raw) return "";
        try {
            new URL(raw);
            return `${raw}/webhook/github`;
        } catch {
            return "";
        }
    });

    const manualWebhookHint = $derived(
        normalizedManualBaseUrl ? `${normalizedManualBaseUrl}/webhook/github` : "",
    );

    function continueFromMode() {
        step = regMode;
        testResult = null;
    }

    function backToMode() {
        step = "mode";
        testResult = null;
    }

    async function handleQuickNext() {
        const raw = webhookUrl.trim().replace(/\/$/, "");
        try {
            new URL(raw);
        } catch {
            await openAlert("Enter a valid public base URL");
            return;
        }
        onQuickSetup(raw);
    }

    async function testConnection() {
        const appId = parseInt(manualAppId, 10);
        if (!Number.isFinite(appId) || !manualPrivateKey.trim()) {
            await openAlert("App ID and private key are required to test");
            return;
        }
        isTesting = true;
        testResult = null;
        try {
            const res = await fetchApi("/github/app/test", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ appId, privateKey: manualPrivateKey }),
            });
            const body = await res.json().catch(() => ({ success: false, message: "Unknown error" }));
            testResult = { success: body.success, message: body.message };
        } catch {
            testResult = { success: false, message: "Request failed" };
        } finally {
            isTesting = false;
        }
    }

    async function saveManual() {
        const appId = parseInt(manualAppId, 10);
        if (!Number.isFinite(appId) || !manualSlug.trim() || !manualPrivateKey.trim() || !manualWebhookSecret.trim()) {
            await openAlert("Fill in all fields: App ID, slug, private key, and webhook secret");
            return;
        }
        isSaving = true;
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
            onSaved();
        } catch {
            await openAlert("Failed to register app");
        } finally {
            isSaving = false;
        }
    }

    async function copyWebhookHint() {
        if (!manualWebhookHint) return;
        try {
            await navigator.clipboard.writeText(manualWebhookHint);
        } catch {
            await openAlert("Failed to copy to clipboard");
        }
    }
</script>

<h3 class="mb-4 text-lg font-semibold tracking-tight dark:text-neutral-50">{title}</h3>

{#if step === "mode"}
    <div class="space-y-4">
        <FormField
            label="Setup method"
            description="Choose how to register your GitHub App"
            linkLabelToControl={false}
            upper>
            {#snippet children({ id: _id })}
                <div class="flex flex-col gap-2" id={_id} role="group">
                    {#each modeOptionList as opt}
                        <SimpleSelectCard
                            label={opt.label}
                            description={opt.description}
                            selected={regMode === opt.value}
                            onclick={() => (regMode = opt.value)} />
                    {/each}
                </div>
            {/snippet}
        </FormField>
        <div class="flex items-center gap-2 pt-2">
            <Button primary onclick={continueFromMode} class="w-auto">Continue</Button>
            <Button secondary onclick={onCancel} class="w-auto">Cancel</Button>
        </div>
    </div>
{:else if step === "quick"}
    <div class="space-y-4">
        <FormField
            label="Public base URL"
            description="Must be reachable by GitHub from the internet">
            {#snippet children({ id })}
                <InputText {id} placeholder="https://proval.example.com" bind:value={webhookUrl} />
            {/snippet}
        </FormField>
        {#if webhookPreview}
            <Description placement="below">Webhook URL: {webhookPreview}</Description>
        {/if}
        <Description>
            You will be redirected to GitHub to create the app. When finished, you will return here automatically.
        </Description>
        <div class="flex items-center gap-2 pt-2">
            <Button primary onclick={handleQuickNext} disabled={!webhookUrl.trim()} class="w-auto">Next</Button>
            <Button secondary onclick={backToMode} class="w-auto">Back</Button>
        </div>
    </div>
{:else}
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
        <FormField
            label="Public base URL"
            description="Used only to show the webhook URL to configure in GitHub App settings">
            {#snippet children({ id })}
                <InputText {id} placeholder="https://proval.example.com" bind:value={manualBaseUrl} />
            {/snippet}
        </FormField>
        {#if manualWebhookHint}
            <div class="flex items-center gap-2 rounded-lg bg-neutral-50 px-3 py-2 text-sm text-neutral-600 dark:bg-neutral-900">
                <span class="min-w-0 flex-1 truncate font-mono text-xs">{manualWebhookHint}</span>
                <Button text onclick={copyWebhookHint} class="shrink-0 text-xs">Copy</Button>
            </div>
        {/if}
        {#if testResult}
            <div
                class="flex items-center gap-2 rounded-lg px-3 py-2 text-sm {testResult.success
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-red-50 text-red-700'}">
                <span class="font-medium">{testResult.success ? "Connected" : "Failed"}:</span>
                {testResult.message}
            </div>
        {/if}
        <div class="flex flex-wrap items-center gap-2 pt-2">
            <Button primary onclick={saveManual} disabled={isSaving} class="w-auto">
                {isSaving ? "Saving..." : "Save"}
            </Button>
            <Button secondary onclick={testConnection} disabled={isTesting || isSaving} class="w-auto">
                {isTesting ? "Testing..." : "Test Connection"}
            </Button>
            <Button secondary onclick={backToMode} disabled={isSaving} class="w-auto">Back</Button>
            <Button secondary onclick={onCancel} disabled={isSaving} class="w-auto">Cancel</Button>
        </div>
    </div>
{/if}
