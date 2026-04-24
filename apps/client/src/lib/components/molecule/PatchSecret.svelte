<script lang="ts">
    import { openAlert } from '$lib/store/modal';
    import fetchApi from '$lib/utils';
    import InputText from '../atom/InputText.svelte';
    import FormField from './FormField.svelte';

    interface Props {
        label: string;
        description?: string;
        placeholder: string;
        patchEndpoint: string;
        onSuccess?: () => void;
    }
    let { label, description, placeholder, patchEndpoint, onSuccess }: Props = $props();

    let value = $state('');

    async function handleSubmit() {
        if (!value) {
            await openAlert('Please enter a value');
            return;
        }
        const response = await fetchApi(patchEndpoint, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ value })
        });
        if (response.ok) {
            await openAlert('Updated successfully');
            onSuccess?.();
        } else {
            await openAlert('Failed to update');
        }
    }
</script>

<FormField {label} {description}>
    {#snippet children({ id })}
        <div class="mt-4 flex gap-3">
            <InputText {id} {placeholder} class="min-w-0 flex-1" bind:value />
            <button
                type="button"
                onclick={handleSubmit}
                class=" cursor-pointer rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-neutral-700 disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
            >
                Save
            </button>
        </div>
    {/snippet}
</FormField>
