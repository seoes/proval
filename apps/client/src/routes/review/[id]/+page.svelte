<script lang="ts">
    import DefaultLayout from "$lib/components/layout/DefaultLayout.svelte";
    import Card from "$lib/components/layout/Card.svelte";
    import Badge from "$lib/components/atom/Badge.svelte";
    import { activityStatusBadge, activityTargetLabel, activityTypeLabel } from "$lib/utils/label";
    import { formatDuration, formatTimeAgo } from "$lib/utils";
    import type { PageProps } from "./$types";

    const { data }: PageProps = $props();
    const review = $derived(data.review);
    const status = $derived(activityStatusBadge(review.status));

    function formatToken(value: number | null): string {
        return value === null ? "—" : String(value);
    }
</script>

<DefaultLayout narrow title="Review">
    <a
        href="/review"
        class="mb-4 inline-block text-sm font-medium text-neutral-600 transition-colors hover:text-neutral-900">
        ← Back to list
    </a>

    <Card spaceY>
        <dl class="space-y-4">
            <div class="flex items-center justify-between gap-4">
                <dt class="text-sm text-neutral-500">Status</dt>
                <dd><Badge variant={status.variant}>{status.label}</Badge></dd>
            </div>
            <div class="flex items-center justify-between gap-4">
                <dt class="text-sm text-neutral-500">Type</dt>
                <dd class="text-sm text-neutral-800">{activityTypeLabel(review.type)}</dd>
            </div>
            <div class="flex items-center justify-between gap-4">
                <dt class="text-sm text-neutral-500">Repository</dt>
                <dd class="text-sm text-neutral-800">
                    {#if review.repositoryId}
                        <a
                            href="/repository/{review.repositoryId}"
                            class="font-medium text-primary underline-offset-2 transition-colors hover:underline">
                            {review.repositoryPath}
                        </a>
                    {:else}
                        {review.repositoryPath}
                    {/if}
                </dd>
            </div>
            <div class="flex items-center justify-between gap-4">
                <dt class="text-sm text-neutral-500">Model</dt>
                <dd class="text-sm text-neutral-800">{review.modelName}</dd>
            </div>
            <div class="flex items-center justify-between gap-4">
                <dt class="text-sm text-neutral-500">Target</dt>
                <dd class="text-sm text-neutral-800">{activityTargetLabel(review.type, review.targetIid)}</dd>
            </div>
            <div class="flex items-center justify-between gap-4">
                <dt class="text-sm text-neutral-500">Input tokens</dt>
                <dd class="text-sm text-neutral-800">{formatToken(review.inputToken)}</dd>
            </div>
            <div class="flex items-center justify-between gap-4">
                <dt class="text-sm text-neutral-500">Cached input tokens</dt>
                <dd class="text-sm text-neutral-800">{formatToken(review.cachedInputToken)}</dd>
            </div>
            <div class="flex items-center justify-between gap-4">
                <dt class="text-sm text-neutral-500">Output tokens</dt>
                <dd class="text-sm text-neutral-800">{formatToken(review.outputToken)}</dd>
            </div>
            {#if review.status === "failed" && review.errorMessage}
                <div>
                    <dt class="text-sm text-neutral-500">Error</dt>
                    <dd class="mt-1 text-sm text-red-700">{review.errorMessage}</dd>
                </div>
            {/if}
            <div class="flex items-center justify-between gap-4">
                <dt class="text-sm text-neutral-500">Created</dt>
                <dd class="text-sm text-neutral-800">{formatTimeAgo(review.createdAt)}</dd>
            </div>
            {#if review.completedAt}
                <div class="flex items-center justify-between gap-4">
                    <dt class="text-sm text-neutral-500">Duration</dt>
                    <dd class="text-sm text-neutral-800">
                        {formatDuration(review.createdAt, review.completedAt)}
                    </dd>
                </div>
            {/if}
        </dl>
    </Card>
</DefaultLayout>
