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

    import type { ModelProvider, ModelResponse } from "@proval/types";

    interface Props {
        mode: "create" | "edit";
        modelId?: number;
        initialData?: Pick<ModelResponse, "provider" | "name" | "label" | "baseUrl">;
        border?: boolean;
    }

    const { mode, modelId, initialData, border = true }: Props = $props();

    let provider = $state<ModelProvider>(initialData?.provider ?? "openai");
    let name = $state(initialData?.name ?? "");
    let label = $state(initialData?.label ?? "");
    let baseUrl = $state(initialData?.baseUrl ?? "");
    let apiKey = $state("");
    let apiKeyModalOpen = $state(false);

    async function handleSubmit(e: Event) {
        e.preventDefault();
        if (!label) {
            await openAlert("Display Name is required");
            return;
        }
        if (!name) {
            await openAlert("Model ID is required");
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

            const confirm = await openConfirm("Create this model?");
            if (!confirm) return;

            const body = {
                provider,
                name,
                label,
                baseUrl,
                apiKey,
            };

            const res = await fetchApi("/model", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            if (!res.ok) {
                const errBody = (await res.json().catch(() => ({}))) as { error?: string };
                await openAlert(errBody.error ?? "Failed to create model");
                return;
            }
        } else {
            const confirm = await openConfirm("Update this model?");
            if (!confirm) return;
            const body = {
                provider,
                name,
                label,
                baseUrl,
            };

            const res = await fetchApi(`/model/${modelId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            if (!res.ok) {
                const errBody = (await res.json().catch(() => ({}))) as { error?: string };
                await openAlert(errBody.error ?? "Failed to update model");
                return;
            }
        }

        goto("/model");
    }

    async function removeModel(rid: number) {
        const confirmed = await openConfirm("Are you sure you want to remove this model?");
        if (!confirmed) return;
        const res = await fetchApi(`/model/${rid}`, {
            method: "DELETE",
        });
        if (!res.ok) {
            const errBody = (await res.json().catch(() => ({}))) as { error?: string };
            await openAlert(errBody.error ?? "Failed to remove model");
            return;
        }
        await openAlert("Model removed successfully");
        goto("/model");
    }

    const apiProviderToggleButtonValueList: {
        label: string;
        description: string;
        value: ModelProvider;
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

    let isTestingConnection = $state(false);

    async function testConnection() {
        isTestingConnection = true;
        try {
            const response = await fetchApi(`/model/verify`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    provider,
                    model: name,
                    baseUrl,
                    apiKey,
                }),
            });

            if (response.ok) {
                await openAlert("Connection successful");
            } else {
                await openAlert("Connection failed");
            }
        } finally {
            isTestingConnection = false;
        }
    }
</script>

<form onsubmit={handleSubmit} class="space-y-8">
    <Card {border} spaceY>
        <FormField label="Display Name" description="The display name of the model">
            {#snippet children({ id })}
                <InputText {id} name="label" placeholder="Main Reviewer" bind:value={label} />
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

        <FormField label="Model ID" description="Model name sent to the API">
            {#snippet children({ id })}
                <InputText {id} placeholder="anthropic/claude-opus-4.6" bind:value={name} />
            {/snippet}
        </FormField>

        <FormField label="Base URL" description="Server host for the LLM API">
            {#snippet children({ id })}
                <InputText {id} placeholder="https://api.anthropic.com" bind:value={baseUrl} />
            {/snippet}
        </FormField>

        {#if mode === "create"}
            <FormField label="API Key" description="Required when creating a model">
                {#snippet children({ id })}
                    <InputText {id} placeholder="sk-..." bind:value={apiKey} password />
                {/snippet}
            </FormField>
        {:else if modelId}
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
                {#if isTestingConnection}
                    <Button text>Testing...</Button>
                {:else}
                    <Button text class="whitespace-nowrap" onclick={testConnection} type="button">
                        Test Connection
                    </Button>
                {/if}
            {/if}
        </div>
        <div class="mr-4">
            {#if mode === "edit" && modelId}
                <Button
                    text
                    onclick={() => {
                        removeModel(modelId);
                    }}
                    type="button">Remove Model</Button>
            {:else if mode === "create"}
                <Button text onclick={() => goto("/model")} type="button">Cancel</Button>
            {/if}
        </div>
    </div>
</form>

{#if modelId && mode === "edit"}
    <Modal bind:open={apiKeyModalOpen}>
        <PatchSecret
            label="Update API Key"
            placeholder="sk-..."
            patchEndpoint={`/model/${modelId}/api-key`}
            onSuccess={() => (apiKeyModalOpen = false)} />
    </Modal>
{/if}
