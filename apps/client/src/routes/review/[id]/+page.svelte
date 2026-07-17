<script lang="ts">
    import { onDestroy, onMount } from "svelte";
    import DefaultLayout from "$lib/components/layout/DefaultLayout.svelte";
    import Card from "$lib/components/layout/Card.svelte";
    import Badge from "$lib/components/atom/Badge.svelte";
    import { activityStatusBadge, activityTargetLabel, activityTypeLabel } from "$lib/utils/label";
    import { formatDuration, formatTimeAgo } from "$lib/utils";
    import fetchApi from "$lib/utils";
    import type { ActivityLogEntry, ActivityLogResponse, ActivityResponse } from "@proval/types";
    import type { PageProps } from "./$types";

    const POLL_MS = 2000;

    const { data }: PageProps = $props();
    let review = $state<ActivityResponse>(data.review);
    let log = $state<ActivityLogResponse>(data.log);
    const status = $derived(activityStatusBadge(review.status));
    const target = $derived(activityTargetLabel(review.type, review.targetIid));
    const typeLabel = $derived(activityTypeLabel(review.type));
    const durationLabel = $derived(
        review.completedAt ? formatDuration(review.createdAt, review.completedAt) : null,
    );

    let pollTimer: ReturnType<typeof setInterval> | null = null;

    function formatToken(value: number | null): string {
        return value === null ? "—" : value.toLocaleString();
    }

    function levelClass(level: ActivityLogEntry["level"]): string {
        switch (level) {
            case "error":
                return "text-red-700";
            case "warn":
                return "text-amber-700";
            case "debug":
                return "text-neutral-400";
            default:
                return "text-neutral-800";
        }
    }

    async function refreshLog(): Promise<void> {
        const response = await fetchApi(`/activity/${review.id}/log`);
        if (!response.ok) return;
        const next: ActivityLogResponse = await response.json();
        log = next;
        if (next.status !== "started" && pollTimer) {
            clearInterval(pollTimer);
            pollTimer = null;
            if (review.status === "started") {
                const meta = await fetchApi(`/activity/${review.id}`);
                if (meta.ok) {
                    review = await meta.json();
                }
            }
        }
    }

    onMount(() => {
        if (log.status === "started" || review.status === "started") {
            pollTimer = setInterval(() => {
                void refreshLog();
            }, POLL_MS);
        }
    });

    onDestroy(() => {
        if (pollTimer) clearInterval(pollTimer);
    });
</script>

<DefaultLayout title="Review">
    <a
        href="/review"
        class="mb-4 inline-block text-sm font-medium text-neutral-600 transition-colors hover:text-neutral-900">
        ← Back to list
    </a>

    <Card>
        <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="min-w-0">
                <div class="flex flex-wrap items-center gap-2">
                    {#if review.repositoryId}
                        <a
                            href="/repository/{review.repositoryId}"
                            class="truncate text-base font-medium text-neutral-900 underline-offset-2 transition-colors hover:text-primary hover:underline">
                            {review.repositoryPath}
                        </a>
                    {:else}
                        <span class="truncate text-base font-medium text-neutral-900">{review.repositoryPath}</span>
                    {/if}
                    <Badge variant={status.variant}>{status.label}</Badge>
                </div>
                <p class="mt-1 text-sm text-neutral-500">
                    {target}
                    <span class="text-neutral-300">·</span>
                    {typeLabel}
                    <span class="text-neutral-300">·</span>
                    {review.modelName}
                </p>
            </div>
            <div class="shrink-0 space-y-1 text-right text-xs">
                <div>
                    <span class="text-neutral-400">Started</span>
                    <span class="ml-1.5 text-neutral-600">{formatTimeAgo(review.createdAt)}</span>
                </div>
                {#if durationLabel}
                    <div>
                        <span class="text-neutral-400">Duration</span>
                        <span class="ml-1.5 font-medium tabular-nums text-neutral-800">{durationLabel}</span>
                    </div>
                {/if}
            </div>
        </div>

        {#if review.status === "failed" && review.errorMessage}
            <p class="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{review.errorMessage}</p>
        {/if}

        <div class="mt-4 flex flex-wrap gap-x-6 gap-y-2 border-t border-neutral-100 pt-3 text-sm">
            <div>
                <span class="text-neutral-500">Input</span>
                <span class="ml-1.5 font-medium tabular-nums text-neutral-800">{formatToken(review.inputToken)}</span>
            </div>
            <div>
                <span class="text-neutral-500">Cached</span>
                <span class="ml-1.5 font-medium tabular-nums text-neutral-800"
                    >{formatToken(review.cachedInputToken)}</span>
            </div>
            <div>
                <span class="text-neutral-500">Output</span>
                <span class="ml-1.5 font-medium tabular-nums text-neutral-800">{formatToken(review.outputToken)}</span>
            </div>
        </div>
    </Card>

    <div class="mt-4">
        <Card spaceY>
            <h2 class="text-sm font-medium text-neutral-800">Run log</h2>
            {#if log.logs.length === 0}
                <p class="text-sm text-neutral-500">No log entries yet.</p>
            {:else}
                <ul class="max-h-[28rem] space-y-2 overflow-y-auto font-mono text-xs">
                    {#each log.logs as entry (entry.timestamp + entry.message)}
                        <li class="flex gap-2 {levelClass(entry.level)}">
                            <span class="shrink-0 text-neutral-400">{entry.timestamp.slice(11, 19)}</span>
                            <span class="shrink-0 font-sans text-neutral-500">[{entry.step}]</span>
                            <span class="min-w-0 break-words">{entry.message}</span>
                        </li>
                    {/each}
                </ul>
            {/if}
        </Card>
    </div>
</DefaultLayout>
