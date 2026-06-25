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

    import type { LlmApiProvider, ModelProviderResponse } from "@proval/types";

    interface Props {
        mode: "create" | "edit";
        modelProviderId?: number;
        initialData?: Pick<ModelProviderResponse, "provider" | "label" | "baseUrl">;
        border?: boolean;
    }

    const { mode, modelProviderId, initialData, border = true }: Props = $props();

    let provider = $state<LlmApiProvider>(initialData?.provider ?? "openai");
    let label = $state(initialData?.label ?? "");
    let baseUrl = $state(initialData?.baseUrl ?? "");
    let apiKey = $state("");
    let apiKeyModalOpen = $state(false);
    let testModalOpen = $state(false);
    let testModelNameDraft = $state("");
    let testResult = $state<{ success: boolean; message: string } | null>(null);
    let isTestingConnection = $state(false);

    async function handleSubmit(e: Event) {
        e.preventDefault();
        if (!label) {
            await openAlert("Display Name is required");
            return;
        }
        if (!baseUrl) {
            await openAlert("Base URL is required");
            return;
        }
        if (!provider) {
            await openAlert("API Provider is required");
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
            const body = {
                provider,
                label,
                baseUrl,
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
    }[] = [
        {
            label: "OpenAI",
            description: "Chat Completions API",
            value: "openai",
        },
        {
            label: "Anthropic",
            description: "Messages API",
            value: "anthropic",
        },
    ];

    function openTestModal() {
        if (!baseUrl.trim()) {
            void openAlert("Base URL is required to test");
            return;
        }
        if (!apiKey.trim()) {
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
            const response = await fetchApi(`/model-provider/verify`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    provider,
                    modelName,
                    baseUrl,
                    apiKey,
                }),
            });
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

<form onsubmit={handleSubmit} class="space-y-8">
    <Card {border} spaceY>
        <FormField label="Display Name" description="A label for this LLM connection">
            {#snippet children({ id })}
                <InputText {id} name="label" placeholder="OpenRouter Production" bind:value={label} />
            {/snippet}
        </FormField>

        <FormField
            label="API Provider"
            description="LLM API provider (e.g. OpenAI compatible, Ollama)"
            linkLabelToControl={false}
            upper>
            {#snippet children({ id: _id })}
                <div class="grid grid-cols-3 gap-2" id={_id} role="group">
                    {#each apiProviderToggleButtonValueList as toggleButtonValue}
                        <ToggleButton
                            class="h-full w-full"
                            label={toggleButtonValue.label}
                            description={toggleButtonValue.description}
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
        {:else if modelProviderId}
            <div class="flex justify-end pt-2">
                <Button text onclick={() => (apiKeyModalOpen = true)} type="button" class="w-auto text-xs">
                    Update API Key
                </Button>
            </div>
        {/if}
    </Card>
    <div class="-mt-2 flex justify-between">
        <div class="flex gap-4 text-sm">
            <Button primary type="submit">{mode === "create" ? "Create" : "Save"}</Button>
            {#if mode === "create"}
                <Button text class="whitespace-nowrap" onclick={openTestModal} type="button">
                    Test Connection
                </Button>
            {/if}
        </div>
        <div class="mr-4">
            {#if mode === "edit" && modelProviderId}
                <Button
                    text
                    onclick={() => {
                        removeModelProvider(modelProviderId);
                    }}
                    type="button">Remove</Button>
            {:else if mode === "create"}
                <Button text onclick={() => goto("/model-provider")} type="button">Cancel</Button>
            {/if}
        </div>
    </div>
</form>

{#if modelProviderId && mode === "edit"}
    <Modal bind:open={apiKeyModalOpen}>
        <PatchSecret
            label="Update API Key"
            placeholder="sk-..."
            patchEndpoint={`/model-provider/${modelProviderId}/api-key`}
            onSuccess={() => (apiKeyModalOpen = false)} />
    </Modal>
{/if}

{#if mode === "create"}
    <Modal bind:open={testModalOpen} class="max-w-lg">
        <div class="space-y-4">
            <FieldTitle>Test connection</FieldTitle>
            <Description>Enter a model ID your API accepts. This is only used for the test and is not saved.</Description>
            <InputText
                placeholder="anthropic/claude-sonnet-4.6"
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
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-red-50 text-red-700'}">
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
