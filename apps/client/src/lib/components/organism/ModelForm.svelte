<script lang="ts">
    import InputText from '../atom/InputText.svelte';
    import { goto } from '$app/navigation';
    import fetchApi from '$lib/utils';
    import LabelWithDescription from '../molecule/LabelWithDescription.svelte';
    import ToggleButton from '../atom/ToggleButton.svelte';
    import { siAnthropic, siOllama } from 'simple-icons';
    import Card from '../layout/Card.svelte';

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
</script>

<form onsubmit={handleSubmit}>
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
    <div class="pt-4">
        <button
            type="submit"
            class="rounded-lg bg-neutral-900 px-6 py-3 text-white transition-colors hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
        >
            {mode === 'create' ? 'Create' : 'Save'}
        </button>
    </div>
</form>
