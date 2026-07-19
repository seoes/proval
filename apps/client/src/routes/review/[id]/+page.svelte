<script lang="ts">
    import DefaultLayout from "$lib/components/layout/DefaultLayout.svelte";
    import Card from "$lib/components/layout/Card.svelte";
    import Badge from "$lib/components/atom/Badge.svelte";
    import { activityStatusBadge, activityTargetLabel, activityTypeLabel } from "$lib/utils/label";
    import { formatDuration, formatTimeAgo } from "$lib/utils";
    import fetchApi from "$lib/utils";
    import type { ActivityLogEntry, ActivityLogResponse, ActivityResponse } from "@proval/types";
    import type { PageProps } from "./$types";
    import { untrack } from "svelte";

    const POLL_MS = 2000;

    const { data }: PageProps = $props();
    let review = $state<ActivityResponse>(data.review);
    let log = $state<ActivityLogResponse>(data.log);
    const status = $derived(activityStatusBadge(review.status));
    const target = $derived(activityTargetLabel(review.type, review.targetIid));
    const typeLabel = $derived(activityTypeLabel(review.type));
    const durationLabel = $derived(review.completedAt ? formatDuration(review.createdAt, review.completedAt) : null);

    let pollTimer: ReturnType<typeof setInterval> | null = null;

    function formatToken(value: number | null): string {
        return value === null ? "—" : value.toLocaleString();
    }

    function formatLogTime(timestamp: string): string {
        const date = new Date(timestamp);
        if (Number.isNaN(date.getTime())) {
            return timestamp;
        }
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");
        const hour = String(date.getHours()).padStart(2, "0");
        const minute = String(date.getMinutes()).padStart(2, "0");
        const second = String(date.getSeconds()).padStart(2, "0");
        return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
    }

    function logLevelTextColor(level: ActivityLogEntry["level"]): string {
        switch (level) {
            case "error":
                return "text-red-700";
            case "warn":
                return "text-amber-700";
            case "debug":
                return "text-neutral-400";
            case "info":
                return "text-neutral-800";
            default:
                return "text-neutral-800";
        }
    }

    function logRowClass(level: ActivityLogEntry["level"], index: number): string {
        if (level === "error") {
            return "bg-red-50 hover:bg-red-50/80";
        }
        const stripe = index % 2 === 1 ? "bg-neutral-100/80 md:bg-transparent" : "";
        return `${stripe} hover:bg-neutral-100/80`;
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

    $effect(() => {
        const nextReview = data.review;
        const nextLog = data.log;
        untrack(() => {
            review = nextReview;
            log = nextLog;
        });
    });

    $effect(() => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const id = data.review.id;
        const shouldPoll = log.status !== "started" && review.status !== "started";
        if (!shouldPoll) return;

        const timer = setInterval(() => {
            void refreshLog();
        }, POLL_MS);
        return () => clearInterval(timer);
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
                        <span class="ml-1.5 font-medium text-neutral-800 tabular-nums">{durationLabel}</span>
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
                <span class="ml-1.5 font-medium text-neutral-800 tabular-nums">{formatToken(review.inputToken)}</span>
            </div>
            <div>
                <span class="text-neutral-500">Cached</span>
                <span class="ml-1.5 font-medium text-neutral-800 tabular-nums"
                    >{formatToken(review.cachedInputToken)}</span>
            </div>
            <div>
                <span class="text-neutral-500">Output</span>
                <span class="ml-1.5 font-medium text-neutral-800 tabular-nums">{formatToken(review.outputToken)}</span>
            </div>
        </div>
    </Card>

    <div class="mt-4">
        <Card>
            <h2 class="mb-3 text-sm font-medium text-neutral-800">Log</h2>
            <div class="overflow-hidden rounded-md border border-neutral-200 bg-neutral-50">
                {#if log.logs.length === 0}
                    <p class="px-3 py-8 text-center font-mono text-xs text-neutral-400">No log entries yet.</p>
                {:else}
                    <ul class="max-h-[32rem] overflow-y-auto py-1 font-mono text-[11px] leading-5 tracking-tight">
                        {#each log.logs as entry, index (index)}
                            <li class="group flex gap-2.5 px-3 py-1.5 md:py-1 {logRowClass(entry.level, index)}">
                                <span class="hidden shrink-0 text-neutral-400 md:inline">{entry.label}</span>
                                <span class="min-w-0 flex-1 break-words {logLevelTextColor(entry.level)}"
                                    >{entry.message}<span
                                        class="ml-2 inline-block font-normal text-neutral-300 opacity-0 transition-opacity group-hover:opacity-100"
                                        >{formatLogTime(entry.timestamp)}</span
                                    ></span>
                            </li>
                        {/each}
                    </ul>
                {/if}
            </div>
        </Card>
    </div>
</DefaultLayout>
