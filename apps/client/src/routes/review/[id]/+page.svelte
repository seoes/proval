<script lang="ts">
    import { goto } from "$app/navigation";
    import DefaultLayout from "$lib/components/layout/DefaultLayout.svelte";
    import Card from "$lib/components/layout/Card.svelte";
    import Badge from "$lib/components/atom/Badge.svelte";
    import Button from "$lib/components/atom/Button.svelte";
    import { openAlert, openConfirm } from "$lib/store/modal";
    import Modal from "$lib/components/atom/Modal.svelte";
    import { activityStatusBadge, activityTargetLabel, activityTypeLabel } from "$lib/utils/label";
    import { formatDuration, formatTimeAgo } from "$lib/utils";
    import fetchApi from "$lib/utils";
    import type { ActivityLogEntry, ActivityLogResponse, ActivityResponse } from "@proval/types";
    import type { PageProps } from "./$types";
    import { untrack } from "svelte";

    const POLL_MS = 1000;

    const { data }: PageProps = $props();
    let review = $state<ActivityResponse>(data.review);
    let log = $state<ActivityLogResponse>(data.log);
    const status = $derived(activityStatusBadge(review.status));
    const target = $derived(activityTargetLabel(review.type, review.targetIid));
    const typeLabel = $derived(activityTypeLabel(review.type));
    const durationLabel = $derived(review.completedAt ? formatDuration(review.createdAt, review.completedAt) : null);
    const showFullErrorButton = $derived.by(() => {
        const message = review.errorMessage;
        if (review.status !== "failed" || !message) {
            return false;
        }
        return message.split("\n").length > 5 || message.length > 400;
    });

    let isRetrying = $state(false);

    const canRetry = $derived(
        review.status === "failed" &&
            review.repositoryId != null &&
            (review.type === "pr_review" || review.type === "issue_open"),
    );
    const isRunning = $derived(review.status === "started");

    async function onRetry(): Promise<void> {
        if (isRetrying || !canRetry) return;

        const message =
            review.type === "pr_review"
                ? "Start a new activity and run the pull request review again? This may post another review or comment on the pull request."
                : "Start a new activity and run the issue open workflow again? This may post another comment on the issue.";

        const confirmed = await openConfirm(message, { title: "Retry activity", confirmText: "Retry" });
        if (!confirmed) return;

        isRetrying = true;
        try {
            const response = await fetchApi(`/activity/${review.id}/retry`, { method: "POST" });
            if (!response.ok) {
                const body = (await response.json().catch(() => null)) as { error?: string } | null;
                await openAlert(body?.error ?? "Failed to retry activity");
                return;
            }
            await goto("/review");
        } finally {
            isRetrying = false;
        }
    }
    let errorModalOpen = $state(false);

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

    async function refreshWhileRunning(id: number): Promise<void> {
        const [logResponse, metaResponse] = await Promise.all([
            fetchApi(`/activity/${id}/log`),
            fetchApi(`/activity/${id}`),
        ]);
        if (logResponse.ok) {
            log = await logResponse.json();
        }
        if (metaResponse.ok) {
            review = await metaResponse.json();
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
        const id = data.review.id;
        if (!isRunning) {
            return;
        }

        untrack(() => {
            void refreshWhileRunning(id);
        });
        const timer = setInterval(() => {
            void refreshWhileRunning(id);
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
                    {#if review.headSha}
                        <span class="text-neutral-300">·</span>
                        <span class="font-mono text-neutral-600">{review.headSha.slice(0, 7)}</span>
                    {/if}
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
            <div class="mt-3 rounded-md bg-red-50 px-3 py-2">
                <p class="line-clamp-5 text-sm break-words whitespace-pre-wrap text-red-700">
                    {review.errorMessage}
                </p>
                {#if showFullErrorButton}
                    <button
                        type="button"
                        class="mt-1.5 cursor-pointer text-xs font-medium text-red-700 underline-offset-2 hover:underline"
                        onclick={() => (errorModalOpen = true)}>
                        View full
                    </button>
                {/if}
            </div>
        {/if}

        <div class="mt-4 border-t border-neutral-100 pt-3">
            <div class="flex flex-col gap-5 md:flex-row md:items-center md:justify-between md:gap-3">
                <div class="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                    <div>
                        <span class="text-neutral-500">Input</span>
                        <span class="ml-1.5 font-medium text-neutral-800 tabular-nums"
                            >{formatToken(review.inputToken)}</span>
                    </div>
                    <div>
                        <span class="text-neutral-500">Cached</span>
                        <span class="ml-1.5 font-medium text-neutral-800 tabular-nums"
                            >{formatToken(review.cachedInputToken)}</span>
                    </div>
                    <div>
                        <span class="text-neutral-500">Output</span>
                        <span class="ml-1.5 font-medium text-neutral-800 tabular-nums"
                            >{formatToken(review.outputToken)}</span>
                    </div>
                </div>
                {#if canRetry}
                    <div class="shrink-0 md:ml-4">
                        <Button primary type="button" disabled={isRetrying} onclick={() => void onRetry()}>
                            {isRetrying ? "Retrying…" : "Retry"}
                        </Button>
                    </div>
                {/if}
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

{#if review.errorMessage}
    <Modal bind:open={errorModalOpen} class="max-w-2xl">
        <h3 class="mb-3 text-lg font-semibold tracking-tight text-neutral-900">Error</h3>
        <pre
            class="max-h-[min(28rem,70vh)] overflow-auto rounded-md bg-red-50 px-3 py-2 font-mono text-xs leading-5 break-words whitespace-pre-wrap text-red-800">{review.errorMessage}</pre>
        <div class="mt-6 flex justify-end">
            <Button primary onclick={() => (errorModalOpen = false)}>Close</Button>
        </div>
    </Modal>
{/if}
