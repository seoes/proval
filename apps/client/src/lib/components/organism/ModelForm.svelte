<script lang="ts">
    import InputText from "../atom/InputText.svelte";
    import { goto } from "$app/navigation";
    import fetchApi from "$lib/utils";
    import FormField from "../molecule/FormField.svelte";
    import ToggleButton from "../atom/ToggleButton.svelte";
    import PatchSecret from "../molecule/PatchSecret.svelte";
    import Card from "../layout/Card.svelte";
    import Modal from "../atom/Modal.svelte";
    import { openAlert, openConfirm } from "$lib/store/modal";
    import Button from "../atom/Button.svelte";
    import Description from "../atom/Description.svelte";
    import FieldTitle from "../atom/FieldTitle.svelte";
    import { siAnthropic } from "simple-icons";
    import { OpenAiLogoIcon } from "phosphor-svelte";
    import type { SimpleIcon } from "simple-icons";
    import { onMount } from "svelte";

    import type { LlmApiProvider, ModelProviderResponse, XaiOAuthAttemptResponse } from "@proval/types";

    interface Props {
        mode: "create" | "edit";
        authMethod?: "apiKey" | "xaiOauth";
        modelProviderId?: number;
        initialData?: Pick<
            ModelProviderResponse,
            "provider" | "label" | "baseUrl" | "timeoutSecond" | "authMethod" | "oauthStatus"
        >;
        border?: boolean;
    }

    const { mode, authMethod = "apiKey", modelProviderId, initialData, border = true }: Props = $props();

    const isXaiOauth = $derived(authMethod === "xaiOauth" || initialData?.authMethod === "xai_oauth");

    let provider = $state<LlmApiProvider>(initialData?.provider ?? "openai");
    let label = $state(initialData?.label ?? "");
    let baseUrl = $state(initialData?.baseUrl ?? "");
    let timeoutSecond = $state(String(initialData?.timeoutSecond ?? 600));
    let apiKey = $state("");
    let apiKeyModalOpen = $state(false);
    let testModalOpen = $state(false);
    let testModelNameDraft = $state("");
    let testResult = $state<{ success: boolean; message: string } | null>(null);
    let isTestingConnection = $state(false);
    let oauthAttempt = $state<XaiOAuthAttemptResponse | null>(null);
    let oauthLoading = $state(false);
    let oauthMessage = $state("");
    let copied = $state(false);
    let now = $state(Date.now());
    const oauthPending = $derived(oauthAttempt?.status === "pending");
    const oauthLocked = $derived(oauthPending || oauthLoading);
    let oauthTimer: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;
    let oauthVersion = 0;
    const oauthStorageKey = $derived(`proval_xai_attempt_${modelProviderId ?? "create"}`);
    const oauthHeader = { "Content-Type": "application/json", "X-Proval-OAuth": "1" };
    const oauthPath = "/model-provider/oauth/xai/attempt";

    function rememberAttempt(id: string | null) {
        try {
            if (id) sessionStorage.setItem(oauthStorageKey, id);
            else sessionStorage.removeItem(oauthStorageKey);
        } catch {
            /* Authorization also works without browser storage */
        }
    }

    async function acceptAttempt(attempt: XaiOAuthAttemptResponse) {
        if (disposed) return;
        oauthAttempt = attempt;
        label = attempt.label;
        timeoutSecond = String(attempt.timeoutSecond);
        if (attempt.status === "authorized") {
            rememberAttempt(null);
            await goto("/model-provider", { invalidateAll: true });
        } else if (attempt.status === "pending") {
            rememberAttempt(attempt.id);
            clearTimeout(oauthTimer);
            oauthTimer = setTimeout(() => void pollAuthorization(attempt.id), 2000);
        } else {
            rememberAttempt(null);
            oauthMessage =
                attempt.error ??
                {
                    denied: "Authorization was denied. You can try again.",
                    expired: "Authorization expired. Start again to get a new code.",
                    cancelled: "Authorization cancelled.",
                    failed: "Authorization failed. You can try again.",
                }[attempt.status];
        }
    }

    async function pollAuthorization(id: string) {
        if (disposed) return;
        const version = oauthVersion;
        try {
            const response = await fetchApi(`${oauthPath}/${id}`, { headers: oauthHeader });
            if (disposed || version !== oauthVersion) return;
            if (!response.ok) {
                if ([401, 403, 404].includes(response.status)) {
                    rememberAttempt(null);
                    oauthAttempt = null;
                    oauthMessage = "Authorization is no longer available. Sign in if needed and start again.";
                    return;
                }
                throw new Error("Status unavailable");
            }
            oauthMessage = "";
            const attempt = await response.json();
            if (version === oauthVersion) await acceptAttempt(attempt);
        } catch {
            if (!disposed && version === oauthVersion) {
                oauthMessage = "Unable to check authorization. Retrying shortly.";
                oauthTimer = setTimeout(() => void pollAuthorization(id), 3000);
            }
        }
    }

    async function startAuthorization() {
        if (!isXaiOauth || oauthLocked) return;
        const timeout = Number(timeoutSecond);
        if (!label.trim() || !Number.isInteger(timeout) || timeout < 10 || timeout > 7200) {
            await openAlert("Enter a Display Name and a timeout between 10 and 7200 seconds");
            return;
        }
        oauthLoading = true;
        oauthVersion++;
        clearTimeout(oauthTimer);
        oauthMessage = "";
        copied = false;
        try {
            const response = await fetchApi(oauthPath, {
                method: "POST",
                headers: oauthHeader,
                body: JSON.stringify({ label: label.trim(), timeoutSecond: timeout, modelProviderId }),
            });
            const body = await response.json();
            if (!response.ok) throw new Error(body.error ?? "Unable to start authorization");
            rememberAttempt(body.id);
            await acceptAttempt(body);
        } catch (error) {
            oauthMessage = error instanceof Error ? error.message : "Unable to start authorization";
        } finally {
            oauthLoading = false;
        }
    }

    async function cancelAuthorization() {
        if (!oauthAttempt || !oauthPending) return;
        const id = oauthAttempt.id;
        clearTimeout(oauthTimer);
        oauthVersion++;
        oauthLoading = true;
        try {
            const response = await fetchApi(`${oauthPath}/${id}`, {
                method: "DELETE",
                headers: oauthHeader,
            });
            if (!response.ok) throw new Error("Unable to cancel authorization");
            await acceptAttempt(await response.json());
        } catch {
            oauthMessage = "Unable to cancel authorization. Please try again.";
            oauthTimer = setTimeout(() => void pollAuthorization(id), 3000);
        } finally {
            oauthLoading = false;
        }
    }

    async function copyCode() {
        try {
            await navigator.clipboard.writeText(oauthAttempt?.userCode ?? "");
            copied = true;
        } catch {
            oauthMessage = "Select and copy the code manually.";
        }
    }

    onMount(() => {
        disposed = false;
        if (isXaiOauth) {
            try {
                const id = sessionStorage.getItem(oauthStorageKey);
                if (id) {
                    oauthLoading = true;
                    void pollAuthorization(id).finally(() => {
                        oauthLoading = false;
                    });
                }
            } catch {
                /* Browser storage is optional */
            }
        }
        const clock = setInterval(() => {
            now = Date.now();
        }, 1000);
        return () => {
            disposed = true;
            oauthVersion++;
            clearTimeout(oauthTimer);
            clearInterval(clock);
        };
    });

    async function handleSubmit(e: Event) {
        e.preventDefault();
        if (oauthLocked || (isXaiOauth && mode === "create")) return;
        if (!label) {
            await openAlert("Display Name is required");
            return;
        }
        if (!isXaiOauth && !baseUrl) {
            await openAlert("Base URL is required");
            return;
        }
        if (!provider) {
            await openAlert("API Provider is required");
            return;
        }
        const timeout = Number(timeoutSecond);
        if (!Number.isInteger(timeout) || timeout < 10 || timeout > 7200) {
            await openAlert("Timeout must be between 10 and 7200 seconds");
            return;
        }
        if (mode === "create") {
            if (!apiKey) {
                await openAlert("API Key is required");
                return;
            }

            const confirm = await openConfirm("Create this model provider?");
            if (!confirm) return;

            const body = {
                provider,
                label,
                baseUrl,
                apiKey,
                timeoutSecond: timeout,
            };

            const res = await fetchApi("/model-provider", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            if (!res.ok) {
                const errBody = (await res.json().catch(() => ({}))) as { error?: string };
                await openAlert(errBody.error ?? "Failed to create model provider");
                return;
            }
        } else {
            const confirm = await openConfirm("Update this model provider?");
            if (!confirm) return;
            const body = isXaiOauth
                ? { label, timeoutSecond: timeout }
                : {
                      provider,
                      label,
                      baseUrl,
                      timeoutSecond: timeout,
                  };

            const res = await fetchApi(`/model-provider/${modelProviderId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            if (!res.ok) {
                const errBody = (await res.json().catch(() => ({}))) as { error?: string };
                await openAlert(errBody.error ?? "Failed to update model provider");
                return;
            }
        }

        goto("/model-provider");
    }

    async function removeModelProvider(id: number) {
        const confirmed = await openConfirm("Are you sure you want to remove this model provider?");
        if (!confirmed) return;
        const res = await fetchApi(`/model-provider/${id}`, {
            method: "DELETE",
        });
        if (!res.ok) {
            const errBody = (await res.json().catch(() => ({}))) as { error?: string };
            await openAlert(errBody.error ?? "Failed to remove model provider");
            return;
        }
        await openAlert("Model provider removed successfully");
        goto("/model-provider");
    }

    const apiProviderToggleButtonValueList: {
        label: string;
        description: string;
        value: LlmApiProvider;
        icon?: SimpleIcon;
    }[] = [
        {
            label: "OpenAI",
            description: "Chat Completions API",
            value: "openai",
        },
        {
            label: "OpenAI",
            description: "Responses API",
            value: "openai_responses",
        },
        {
            label: "Anthropic",
            description: "Messages API",
            value: "anthropic",
            icon: siAnthropic,
        },
    ];

    function openTestModal() {
        if (!isXaiOauth && !baseUrl.trim()) {
            void openAlert("Base URL is required to test");
            return;
        }
        if (!isXaiOauth && !apiKey.trim()) {
            void openAlert("API Key is required to test");
            return;
        }
        testResult = null;
        testModalOpen = true;
    }

    async function testConnection() {
        const modelName = testModelNameDraft.trim();
        if (!modelName) return;

        isTestingConnection = true;
        testResult = null;
        try {
            const response = await fetchApi(
                isXaiOauth ? `/model-provider/${modelProviderId}/verify` : `/model-provider/verify`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(
                        isXaiOauth
                            ? { modelName }
                            : {
                                  provider,
                                  modelName,
                                  baseUrl,
                                  apiKey,
                                  timeoutSecond: Number(timeoutSecond),
                              },
                    ),
                },
            );
            const body = (await response.json().catch(() => ({}))) as {
                success?: boolean;
                message?: string;
                error?: string;
            };
            if (response.ok) {
                testResult = {
                    success: true,
                    message: body.message ?? "Connection successful",
                };
            } else {
                testResult = {
                    success: false,
                    message: body.message ?? body.error ?? "Connection failed",
                };
            }
        } catch {
            testResult = { success: false, message: "Request failed" };
        } finally {
            isTestingConnection = false;
        }
    }
</script>

{#snippet openAiIcon()}
    <OpenAiLogoIcon class="size-6" aria-hidden="true" />
{/snippet}

<form onsubmit={handleSubmit} class="space-y-8">
    <Card {border} spaceY>
        <FormField label="Display Name" description="A label for this LLM connection">
            {#snippet children({ id })}
                <InputText
                    {id}
                    name="label"
                    disabled={oauthLocked}
                    placeholder={isXaiOauth ? "xAI" : "OpenRouter Production"}
                    bind:value={label} />
            {/snippet}
        </FormField>

        {#if !isXaiOauth}
            <FormField
                label="API Provider"
                description="LLM API provider (e.g. OpenAI compatible, Ollama)"
                linkLabelToControl={false}
                upper>
                {#snippet children({ id: _id })}
                    <div class="grid grid-cols-1 gap-2 sm:grid-cols-3" id={_id} role="group">
                        {#each apiProviderToggleButtonValueList as toggleButtonValue}
                            <ToggleButton
                                class="aspect-auto h-full min-h-32 w-full sm:aspect-square"
                                label={toggleButtonValue.label}
                                description={toggleButtonValue.description}
                                icon={toggleButtonValue.icon}
                                children={toggleButtonValue.value === "anthropic" ? undefined : openAiIcon}
                                selected={provider === toggleButtonValue.value}
                                onclick={() => (provider = toggleButtonValue.value)} />
                        {/each}
                    </div>
                {/snippet}
            </FormField>

            <FormField label="Base URL" description="Server host for the LLM API">
                {#snippet children({ id })}
                    <InputText {id} placeholder="https://openrouter.ai/api/v1" bind:value={baseUrl} />
                {/snippet}
            </FormField>

            {#if mode === "create"}
                <FormField label="API Key" description="Required when creating a model provider">
                    {#snippet children({ id })}
                        <InputText {id} placeholder="sk-..." bind:value={apiKey} password />
                    {/snippet}
                </FormField>
            {/if}
        {/if}

        <FormField
            label="Request Timeout"
            description="Maximum wait time for LLM responses in seconds. Increase for slow local models.">
            {#snippet children({ id })}
                <InputText {id} placeholder="600" bind:value={timeoutSecond} disabled={oauthLocked} />
            {/snippet}
        </FormField>

        {#if isXaiOauth}
            {#if mode === "edit"}
                <Description
                    >{initialData?.oauthStatus === "reauthorization_required"
                        ? "Reconnect your xAI account to continue using this provider."
                        : "xAI account authorized. Model access depends on your subscription."}</Description>
            {/if}
            {#if oauthAttempt && oauthPending}
                <div class="space-y-3 rounded-lg border border-border p-4" aria-live="polite">
                    <FieldTitle>Authorize with xAI</FieldTitle>
                    <Description>Open xAI and approve this connection using the code below.</Description>
                    <div class="flex items-center gap-3">
                        <code class="text-xl font-semibold tracking-wider select-all">{oauthAttempt.userCode}</code>
                        <Button text onclick={copyCode}>{copied ? "Copied" : "Copy code"}</Button>
                    </div>
                    <Description
                        >Expires in {Math.max(0, Math.ceil((oauthAttempt.expiresAt - now) / 1000))} seconds</Description>
                    <div class="flex gap-3">
                        <Button primary href={oauthAttempt.verificationUri} target="_blank" rel="noopener noreferrer"
                            >Open xAI</Button>
                        <Button text onclick={cancelAuthorization} disabled={oauthLoading}>Cancel authorization</Button>
                    </div>
                </div>
            {/if}
            {#if oauthMessage}<p role="status" class="text-sm text-muted-foreground">{oauthMessage}</p>{/if}
        {/if}

        {#if mode === "edit" && modelProviderId && !isXaiOauth}
            <div class="flex justify-end pt-2">
                <Button text onclick={() => (apiKeyModalOpen = true)} type="button" class="w-auto text-xs">
                    Update API Key
                </Button>
            </div>
        {/if}
    </Card>
    <div class="flex flex-wrap justify-between gap-3 pt-2">
        <div class="flex flex-wrap gap-3 text-sm">
            {#if isXaiOauth}
                {#if mode === "edit"}<Button primary type="submit" disabled={oauthLocked}>Save</Button>{/if}
                <Button
                    primary={mode === "create"}
                    secondary={mode === "edit"}
                    type="button"
                    onclick={startAuthorization}
                    disabled={oauthLocked}
                    >{oauthLoading ? "Connecting..." : mode === "edit" ? "Reconnect xAI" : "Connect to xAI"}</Button>
                {#if mode === "edit"}<Button text onclick={openTestModal} disabled={oauthLocked}>Test Connection</Button
                    >{/if}
            {:else}
                <Button primary type="submit">{mode === "create" ? "Create" : "Save"}</Button>
                {#if mode === "create"}
                    <Button text class="whitespace-nowrap" onclick={openTestModal} type="button"
                        >Test Connection</Button>
                {/if}
            {/if}
        </div>
        <div>
            {#if mode === "edit" && modelProviderId}
                <Button
                    text
                    disabled={oauthLocked}
                    onclick={() => {
                        removeModelProvider(modelProviderId);
                    }}
                    type="button">Remove</Button>
            {:else if mode === "create"}
                <Button text onclick={() => goto("/model-provider")} type="button" disabled={oauthLocked}
                    >Cancel</Button>
            {/if}
        </div>
    </div>
</form>

{#if modelProviderId && mode === "edit" && !isXaiOauth}
    <Modal bind:open={apiKeyModalOpen}>
        <PatchSecret
            label="Update API Key"
            placeholder="sk-..."
            patchEndpoint={`/model-provider/${modelProviderId}/api-key`}
            onSuccess={() => (apiKeyModalOpen = false)} />
    </Modal>
{/if}

{#if (mode === "create" && !isXaiOauth) || (mode === "edit" && isXaiOauth)}
    <Modal bind:open={testModalOpen} class="max-w-lg">
        <div class="space-y-4">
            <FieldTitle>Test connection</FieldTitle>
            <Description
                >Enter a model ID your API accepts. This is only used for the test and is not saved.</Description>
            <InputText
                placeholder={isXaiOauth ? "grok-4.7" : "anthropic/claude-sonnet-4.6"}
                bind:value={testModelNameDraft}
                onkeydown={(e) => {
                    if (e.key === "Enter") {
                        e.preventDefault();
                        if (!isTestingConnection && testModelNameDraft.trim()) {
                            void testConnection();
                        }
                    }
                }} />
            {#if testResult}
                <div
                    class="flex items-center gap-2 rounded-lg px-3 py-2 text-sm {testResult.success
                        ? 'bg-success-muted text-success'
                        : 'bg-destructive-muted text-destructive'}">
                    <span class="font-medium">{testResult.success ? "Connected" : "Failed"}:</span>
                    {testResult.message}
                </div>
            {/if}
            <div class="flex justify-end gap-3 pt-1">
                <Button text type="button" onclick={() => (testModalOpen = false)}>Cancel</Button>
                <Button
                    primary
                    type="button"
                    onclick={testConnection}
                    disabled={isTestingConnection || !testModelNameDraft.trim()}>
                    {isTestingConnection ? "Testing..." : "Test"}
                </Button>
            </div>
        </div>
    </Modal>
{/if}
