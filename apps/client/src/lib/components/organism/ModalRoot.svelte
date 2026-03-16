<script lang="ts">
    import Modal from "$lib/components/atom/Modal.svelte";
    import { modalStore, closeModal } from "$lib/store/modal";
</script>

<Modal open={$modalStore.open} closeOnOverlayClick={$modalStore.closeOnOverlayClick} onclose={() => closeModal(false)}>
    {#if $modalStore.title}
        <h3 class="text-lg font-semibold dark:text-neutral-50 tracking-tight mb-3">{$modalStore.title}</h3>
    {/if}
    <p class="text-sm text-neutral-600 dark:text-neutral-400 whitespace-pre-line">
        {$modalStore.message}
    </p>
    <div class="flex gap-3 mt-6">
        {#if $modalStore.type === "confirm"}
            <button
                class="flex-1 h-11 rounded-xl cursor-pointer border text-sm font-medium text-neutral-600 dark:text-neutral-400 dark:border-neutral-700 focus:outline-none"
                onclick={() => closeModal(false)}
            >
                {$modalStore.cancelText}
            </button>
        {/if}
        <button
            class="flex-1 h-11 bg-neutral-800 text-neutral-50 dark:text-neutral-800 dark:bg-neutral-50 rounded-xl cursor-pointer text-sm font-medium focus:outline-none"
            onclick={() => closeModal(true)}
        >
            {$modalStore.confirmText}
        </button>
    </div>
</Modal>
