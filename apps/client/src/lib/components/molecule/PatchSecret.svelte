<script lang="ts">
    import { openAlert } from "$lib/store/modal";
    import fetchApi from "$lib/utils";
    import Button from "../atom/Button.svelte";
    import InputText from "../atom/InputText.svelte";
    import FormField from "./FormField.svelte";

    interface Props {
        label: string;
        description?: string;
        placeholder: string;
        patchEndpoint: string;
        onSuccess?: () => void;
    }
    let { label, description, placeholder, patchEndpoint, onSuccess }: Props = $props();

    let value = $state("");

    async function handleSubmit() {
        const trimmed = value.trim();
        if (!trimmed) {
            await openAlert("Please enter a value");
            return;
        }
        const response = await fetchApi(patchEndpoint, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ value: trimmed }),
        });
        if (response.ok) {
            await openAlert("Updated successfully");
            onSuccess?.();
        } else {
            await openAlert("Failed to update");
        }
    }
</script>

<FormField {label} {description}>
    {#snippet children({ id })}
        <div class="flex items-center gap-3">
            <InputText {id} {placeholder} class="min-w-0 flex-1" bind:value />
            <Button primary type="button" onclick={handleSubmit}>Save</Button>
        </div>
    {/snippet}
</FormField>
