<script lang="ts">
    import DefaultLayout from "$lib/components/layout/DefaultLayout.svelte";
    import ResourceCard from "$lib/components/molecule/ResourceCard.svelte";
    import Badge from "$lib/components/atom/Badge.svelte";
    import { activityStatusBadge, activityTargetLabel, activityTypeLabel } from "$lib/utils/label";
    import { formatTimeAgo } from "$lib/utils";
    import type { PageProps } from "./$types";

    const { data }: PageProps = $props();

    const hasNext = $derived(data.page * data.limit < data.total);
    const hasPrev = $derived(data.page > 1);
    const showPagination = $derived(data.total > data.limit);
</script>

<DefaultLayout title="Review">
    {#if data.reviewList.length === 0}
        <div class="rounded-lg border border-neutral-200 bg-white px-6 py-14 text-center">
            <p class="text-sm text-neutral-500">No reviews yet.</p>
        </div>
    {:else}
        <div class="overflow-hidden rounded-lg border border-neutral-200 bg-white">
            {#each data.reviewList as review (review.id)}
                {@const status = activityStatusBadge(review.status)}
                {@const target = activityTargetLabel(review.type, review.targetIid)}
                {@const typeLabel = activityTypeLabel(review.type)}
                {@const timeLabel = formatTimeAgo(review.createdAt)}
                {#snippet header()}
                    <div class="min-w-0">
                        <p class="truncate text-sm font-medium text-neutral-800">
                            {review.repositoryPath}
                            <span class="font-normal text-neutral-500">· {target} · {typeLabel}</span>
                        </p>
                        {#if review.status === "failed" && review.errorMessage}
                            <p class="mt-0.5 line-clamp-2 text-xs text-red-700 lg:line-clamp-1">
                                {review.errorMessage}
                            </p>
                        {/if}
                    </div>
                {/snippet}
                {#snippet badge()}
                    <Badge variant={status.variant}>{status.label}</Badge>
                    <span class="text-xs text-neutral-500 lg:hidden">{review.modelName}</span>
                    <span class="text-sm text-neutral-500 lg:hidden">{timeLabel}</span>
                    <Badge variant="neutral" class="hidden lg:inline-flex">{review.modelName}</Badge>
                    <span class="hidden text-sm text-neutral-500 lg:inline">{timeLabel}</span>
                {/snippet}
                <ResourceCard
                    compact
                    embedded
                    href="/review/{review.id}"
                    provider={review.provider}
                    class={review.status === "failed" ? "bg-red-50/40 lg:bg-red-50/30" : ""}
                    {header}
                    {badge} />
            {/each}
        </div>

        {#if showPagination}
            <div class="mt-4 flex items-center justify-between text-sm text-neutral-600">
                <span>Page {data.page}</span>
                <div class="flex gap-2">
                    {#if hasPrev}
                        <a
                            href="?page={data.page - 1}"
                            class="rounded-lg border border-neutral-200 bg-white px-3 py-1.5 font-medium text-neutral-800 transition-colors hover:bg-neutral-50">
                            Previous
                        </a>
                    {:else}
                        <span class="rounded-lg border border-neutral-100 px-3 py-1.5 text-neutral-400">Previous</span>
                    {/if}
                    {#if hasNext}
                        <a
                            href="?page={data.page + 1}"
                            class="rounded-lg border border-neutral-200 bg-white px-3 py-1.5 font-medium text-neutral-800 transition-colors hover:bg-neutral-50">
                            Next
                        </a>
                    {:else}
                        <span class="rounded-lg border border-neutral-100 px-3 py-1.5 text-neutral-400">Next</span>
                    {/if}
                </div>
            </div>
        {/if}
    {/if}
</DefaultLayout>
