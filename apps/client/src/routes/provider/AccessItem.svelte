<script lang="ts">
    import Button from "$lib/components/atom/Button.svelte";
    import GitProviderIcon from "$lib/components/atom/GitProviderIcon.svelte";
    import { TrashIcon, PencilIcon } from "phosphor-svelte";
    import type { AccessResponse } from "@proval/types";

    type TestResult = { id: number; success: boolean; message: string };

    let {
        item,
        testResult,
        isTesting,
        onTest,
        onUpdateToken,
        onEdit,
        onDelete,
    }: {
        item: AccessResponse;
        testResult: TestResult | null;
        isTesting: boolean;
        onTest: () => void;
        onUpdateToken: () => void;
        onEdit: () => void;
        onDelete: () => void;
    } = $props();
</script>

<div class="py-4 first:pt-0 last:pb-0">
    <div class="flex items-start justify-between gap-3">
        <div class="flex min-w-0 items-center gap-3">
            <GitProviderIcon provider={item.provider} boxed />
            <div class="min-w-0">
                <div class="flex items-center gap-2">
                    <p class="truncate font-medium text-neutral-800">
                        {item.name}
                    </p>
                </div>
                <p class="truncate text-sm text-neutral-500">
                    {item.baseUrl}
                </p>
            </div>
        </div>
        <div>
            <div class="flex shrink-0 flex-wrap items-center justify-end gap-1">
                <button
                    class="rounded p-1.5 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600"
                    onclick={onEdit}>
                    <PencilIcon class="size-4" />
                </button>
                <button
                    class="rounded p-1.5 text-neutral-400 transition-colors hover:bg-red-50 hover:text-red-600"
                    onclick={onDelete}>
                    <TrashIcon class="size-4" />
                </button>
            </div>
        </div>
    </div>
    <div class="mt-2 flex justify-end">
        <Button
            text
            onclick={onTest}
            disabled={isTesting}
            class="h-auto w-auto shrink-0 px-2 py-1.5 text-xs font-medium">
            {isTesting ? "Testing..." : "Test Connection"}
        </Button>
        <Button text onclick={onUpdateToken} class="h-auto w-auto shrink-0 px-2 py-1.5 text-xs font-medium">
            Update Access Token
        </Button>
    </div>
    {#if testResult && testResult.id === item.id}
        <div
            class="mt-2 flex items-center gap-2 rounded-lg px-3 py-2 text-sm {testResult.success
                ? 'bg-emerald-50 text-emerald-700'
                : 'bg-red-50 text-red-700'}">
            <span class="font-medium">{testResult.success ? "Connected" : "Failed"}:</span>
            {testResult.message}
        </div>
    {/if}
</div>
