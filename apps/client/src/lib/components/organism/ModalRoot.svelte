<script lang="ts">
    import Modal from "$lib/components/atom/Modal.svelte";
    import { modalStore, closeModal } from "$lib/store/modal";
    import Button from "../atom/Button.svelte";
</script>

<Modal open={$modalStore.open} closeOnOverlayClick={$modalStore.closeOnOverlayClick} onclose={() => closeModal(false)}>
    {#if $modalStore.title}
        <h3 class="mb-3 text-lg font-semibold tracking-tight dark:text-neutral-50">
            {$modalStore.title}
        </h3>
    {/if}
    <p class="text-sm whitespace-pre-line text-neutral-600 dark:text-neutral-400">
        {$modalStore.message}
    </p>
    <div class="mt-6 flex justify-end gap-3">
        {#if $modalStore.type === "confirm"}
            <Button secondary onclick={() => closeModal(false)}>{$modalStore.cancelText}</Button>
        {/if}
        <Button primary onclick={() => closeModal(true)}>{$modalStore.confirmText}</Button>
    </div>
</Modal>
