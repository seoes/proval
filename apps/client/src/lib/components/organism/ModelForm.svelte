<script lang="ts">
    import InputText from '../atom/InputText.svelte';

    interface Props {
        mode: 'create' | 'edit';
        provider: string;
        name: string;
        label: string;
        baseUrl: string;
        apiKey: string;
    }
    let { mode, provider, name, label, baseUrl, apiKey }: Props = $props();
</script>

<div>
    <div>
        <h2 class="text-lg font-semibold">Model</h2>
    </div>
    <div>
        <form>
            <div>
                <InputText placeholder="Main Reviewer" bind:value={label} />
            </div>
            <div>
                <InputText placeholder="claude-opus-4-6" bind:value={name} />
            </div>
            <div>
                <select bind:value={provider}>
                    <option value="openai">OpenAI</option>
                    <option value="anthropic">Anthropic</option>
                    <option value="ollama">Ollama</option>
                    <option value="llama.cpp">Llama.cpp</option>
                </select>
            </div>
            <div>
                <InputText placeholder="https://api.anthropic.com" bind:value={baseUrl} />
            </div>
            <div>
                <InputText placeholder="sk-..." bind:value={apiKey} />
            </div>
            <div>
                <button type="submit">Save</button>
            </div>
        </form>
    </div>
</div>
