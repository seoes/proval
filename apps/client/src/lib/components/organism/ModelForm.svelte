<script lang="ts">
    import InputText from '../atom/InputText.svelte';
    import { goto } from '$app/navigation';
    import fetchApi from '$lib/utils';
    import LabelWithDescription from '../molecule/LabelWithDescription.svelte';
    import ToggleButton from '../atom/ToggleButton.svelte';
    import { siAnthropic, siOllama } from 'simple-icons';
    import Card from '../layout/Card.svelte';
    import { openAlert, openConfirm } from '$lib/store/modal';
    import Button from '../atom/Button.svelte';

    interface Props {
        mode: 'create' | 'edit';
        modelId?: number;
        initialData?: {
            provider: string;
            name: string;
            label: string;
            baseUrl: string;
            apiKey: string;
        };
        border?: boolean;
    }

    let { mode, modelId, initialData, border = true }: Props = $props();

    let provider = $state(initialData?.provider ?? 'openai');
    let name = $state(initialData?.name ?? '');
    let label = $state(initialData?.label ?? '');
    let baseUrl = $state(initialData?.baseUrl ?? '');
    let apiKey = $state(initialData?.apiKey ?? '');

    async function handleSubmit(e: Event) {
        e.preventDefault();

        if (mode === 'create') {
            const confirm = await openConfirm('Create this model?');
            if (!confirm) return;
            const body = {
                provider,
                name,
                label,
                baseUrl,
                apiKey
            };

            await fetchApi('/model', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
        } else {
            const confirm = await openConfirm('Update this model?');
            if (!confirm) return;
            const body = {
                provider,
                name,
                label,
                baseUrl
            };

            await fetchApi(`/model/${modelId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
        }

        goto('/model');
    }

    async function removeModel(modelId: number) {
        const confirmed = await openConfirm('Are you sure you want to remove this model?');
        if (!confirmed) return;
        await fetchApi(`/model/${modelId}`, {
            method: 'DELETE'
        });
        await openAlert('Model removed successfully');
        goto('/model');
    }

    const apiProviderToggleButtonValueList = [
        {
            label: 'OpenAI',
            description: 'Chat Completions API',
            value: 'openai'
        }
        // {
        //     label: 'OpenAI',
        //     description: 'Responses API',
        //     value: 'openai'
        // },
        // {
        //     label: 'Anthropic',
        //     value: 'anthropic',
        //     icon: siAnthropic
        // },
        // {
        //     label: 'Ollama',
        //     value: 'ollama',
        //     icon: siOllama
        // },
        // {
        //     label: 'Llama.cpp',
        //     value: 'llama.cpp'
        // }
    ];

    let isTestingConnection = $state(false);

    async function testConnection() {
        isTestingConnection = true;
        const response = await fetchApi(`/model/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                provider,
                model: name,
                baseUrl,
                apiKey
            })
        });

        if (response.ok) {
            await openAlert('Connection successful');
        } else {
            isTestingConnection = false;
            await openAlert('Connection failed');
        }
        isTestingConnection = false;
    }
</script>

<form onsubmit={handleSubmit} class="space-y-8">
    <Card>
        <div>
            <LabelWithDescription
                label="Display Name"
                description="The display name of the model"
            />
            <InputText name="label" placeholder="Main Reviewer" bind:value={label} />
        </div>

        <div>
            <LabelWithDescription
                label="API Provider"
                description="LLM's API (ex. OpenAI compatible, Ollama...)"
            />
            <div class="mt-4 grid grid-cols-3 gap-2">
                {#each apiProviderToggleButtonValueList as toggleButtonValue}
                    <ToggleButton
                        class="h-full w-full"
                        label={toggleButtonValue.label}
                        description={toggleButtonValue.description}
                        selected={provider === toggleButtonValue.value}
                        onclick={() => (provider = toggleButtonValue.value)}
                        icon={toggleButtonValue.icon}
                    />
                {/each}
            </div>
        </div>
        <div>
            <LabelWithDescription label="Model ID" description="Model's name to call from API" />
            <InputText placeholder="anthropic/claude-opus-4.6" bind:value={name} />
        </div>
        <div>
            <LabelWithDescription
                label="Base URL"
                description="Server Host to use LLM through API"
            />
            <InputText placeholder="https://api.anthropic.com" bind:value={baseUrl} />
        </div>

        {#if mode === 'create'}
            <div>
                <label class="mb-1 block text-sm font-medium text-neutral-700">API Key</label>
                <InputText placeholder="sk-..." bind:value={apiKey} password />
            </div>
        {/if}
    </Card>
    <div class="-mt-2 flex justify-between">
        <div class="flex gap-4 text-sm">
            <Button primary type="submit">{mode === 'create' ? 'Create' : 'Save'}</Button>
            {#if mode === 'create'}
                {#if isTestingConnection}
                    <Button text>Testing...</Button>
                {:else}
                    <Button text onclick={testConnection}>Test Connection</Button>
                {/if}
            {/if}
        </div>
        <div class="mr-4">
            {#if mode === 'edit' && modelId}
                <Button
                    text
                    onclick={() => {
                        removeModel(modelId);
                    }}>Remove Model</Button
                >
            {:else if mode === 'create'}
                <Button text onclick={() => goto('/model')}>Cancel</Button>
            {/if}
        </div>
    </div>
</form>
