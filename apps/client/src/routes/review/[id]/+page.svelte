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
    import { activityTargetWebUrl, viewInProviderLabel } from "../../repository/[id]/load.js";
    import type { ActivityLogEntry, ActivityLogResponse, ActivityResponse } from "@proval/types";
    import type { PageProps } from "./$types";
    import { readReviewListBackHref } from "../filterQuery.js";
    import { untrack } from "svelte";
    import { CaretRightIcon, WrenchIcon } from "phosphor-svelte";
    import { serializeActivityLogList } from "./activity-log.js";
    import { toolIconRecord, transformToolName } from "$lib/utils/tool.js";

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
    let selectedLabel = $state<string | null>(null);

    const canRetry = $derived(
        (review.status === "failed" || review.status === "canceled") &&
            review.repositoryId != null &&
            (review.type === "pr_review" ||
                review.type === "issue_open" ||
                ((review.type === "pr_reply" || review.type === "issue_reply") && review.targetCommentId != null)),
    );
    const canCancel = $derived(review.status === "started");
    const isRunning = $derived(review.status === "started");

    let isCanceling = $state(false);

    const backToListHref = $derived(readReviewListBackHref());

    const targetWebUrl = $derived(activityTargetWebUrl(review, data.provider));
    const viewInGitLabel = $derived(viewInProviderLabel(review.provider));

    async function onRetry(): Promise<void> {
        if (isRetrying || !canRetry) return;

        const retryMessageRecord: Record<ActivityResponse["type"], string> = {
            pr_review:
                "Start a new activity and run the pull request review again? This may post another review or comment on the pull request.",
            pr_reply:
                "Start a new activity and reply to the same pull request comment again? This may post another comment on the pull request.",
            issue_open:
                "Start a new activity and run the issue open workflow again? This may post another comment on the issue.",
            issue_reply:
                "Start a new activity and reply to the same issue comment again? This may post another comment on the issue.",
        };

        const message = retryMessageRecord[review.type];

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
            await goto(backToListHref);
        } finally {
            isRetrying = false;
        }
    }

    async function onCancel(): Promise<void> {
        if (isCanceling || !canCancel) return;

        const confirmed = await openConfirm(
            "Stop this running job? The agent will stop after the current step finishes.",
            { title: "Cancel job", confirmText: "Cancel job" },
        );
        if (!confirmed) return;

        isCanceling = true;
        try {
            const response = await fetchApi(`/activity/${review.id}/cancel`, { method: "POST" });
            if (!response.ok) {
                const body = (await response.json().catch(() => null)) as { error?: string } | null;
                await openAlert(body?.error ?? "Failed to cancel activity");
                return;
            }
            await refreshWhileRunning(review.id);
        } finally {
            isCanceling = false;
        }
    }

    let errorModalOpen = $state(false);

    function formatToken(value: number | null): string {
        return value === null ? "—" : value.toLocaleString();
    }

    function formatCacheRate(cached: number | null, input: number | null): string {
        if (cached === null || input === null || input <= 0) {
            return "—";
        }
        return `${((cached / input) * 100).toFixed(1)}%`;
    }

    const cacheRateLabel = $derived(formatCacheRate(review.cachedInputToken, review.inputToken));

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
                return "text-destructive";
            case "warn":
                return "text-warning";
            case "debug":
                return "text-muted-foreground";
            case "info":
                return "text-foreground";
            default:
                return "text-foreground";
        }
    }

    function logRowClass(level: ActivityLogEntry["level"], index: number): string {
        if (level === "error") {
            return "bg-destructive-muted hover:bg-destructive-muted/80";
        }
        const stripe = index % 2 === 1 ? "bg-muted/80 md:bg-transparent" : "";
        return `${stripe} hover:bg-accent/80`;
    }

    const logRowList = $derived(serializeActivityLogList(log.logs));
    const labelList = $derived([...new Set(logRowList.map((row) => row.entry.label))]);
    const visibleLogList = $derived(logRowList.filter((row) => !selectedLabel || row.entry.label === selectedLabel));

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
        href={backToListHref}
        class="mb-4 inline-block text-sm font-medium text-secondary-foreground transition-colors hover:text-foreground">
        ← Back to list
    </a>

    <Card>
        <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="min-w-0">
                <div class="flex flex-wrap items-center gap-2">
                    {#if review.repositoryId}
                        <a
                            href="/repository/{review.repositoryId}"
                            class="truncate text-base font-medium text-foreground underline-offset-2 transition-colors hover:text-primary-text hover:underline">
                            {review.repositoryPath}
                        </a>
                    {:else}
                        <span class="truncate text-base font-medium text-foreground">{review.repositoryPath}</span>
                    {/if}
                    <Badge variant={status.variant}>{status.label}</Badge>
                </div>
                <p class="mt-1 text-sm text-muted-foreground">
                    {target}
                    <span class="text-border-strong">·</span>
                    {typeLabel}
                    <span class="text-border-strong">·</span>
                    {review.modelName}
                    {#if review.headSha}
                        <span class="text-border-strong">·</span>
                        <span class="font-mono text-secondary-foreground">{review.headSha.slice(0, 7)}</span>
                    {/if}
                </p>
            </div>
            <div class="shrink-0 space-y-1 text-right text-xs">
                <div>
                    <span class="text-muted-foreground">Started</span>
                    <span class="ml-1.5 text-secondary-foreground">{formatTimeAgo(review.createdAt)}</span>
                </div>
                {#if durationLabel}
                    <div>
                        <span class="text-muted-foreground">Duration</span>
                        <span class="ml-1.5 font-medium text-foreground tabular-nums">{durationLabel}</span>
                    </div>
                {/if}
            </div>
        </div>

        {#if review.status === "failed" && review.errorMessage}
            <div class="mt-3 rounded-md bg-destructive-muted px-3 py-2">
                <p class="line-clamp-5 text-sm break-words whitespace-pre-wrap text-destructive">
                    {review.errorMessage}
                </p>
                {#if showFullErrorButton}
                    <button
                        type="button"
                        class="mt-1.5 cursor-pointer text-xs font-medium text-destructive underline-offset-2 hover:underline"
                        onclick={() => (errorModalOpen = true)}>
                        View full
                    </button>
                {/if}
            </div>
        {/if}

        <div class="mt-4 border-t border-border pt-3">
            <div class="flex flex-col gap-5 md:flex-row md:items-center md:justify-between md:gap-3">
                <div class="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                    <div>
                        <span class="text-muted-foreground">Input</span>
                        <span class="ml-1.5 font-medium text-foreground tabular-nums"
                            >{formatToken(review.inputToken)}</span>
                    </div>
                    <div>
                        <span class="text-muted-foreground">Cached</span>
                        <span class="ml-1.5 font-medium text-foreground tabular-nums"
                            >{formatToken(review.cachedInputToken)}</span>
                    </div>
                    <div>
                        <span class="text-muted-foreground">Output</span>
                        <span class="ml-1.5 font-medium text-foreground tabular-nums"
                            >{formatToken(review.outputToken)}</span>
                    </div>
                    <div>
                        <span class="text-muted-foreground">Cache Rate</span>
                        <span class="ml-1.5 font-medium text-foreground tabular-nums">{cacheRateLabel}</span>
                    </div>
                </div>
                {#if targetWebUrl || canCancel || canRetry}
                    <div class="flex shrink-0 flex-wrap items-center justify-end gap-2 md:ml-4">
                        {#if targetWebUrl}
                            <Button href={targetWebUrl} secondary target="_blank" rel="noopener noreferrer">
                                {viewInGitLabel}
                            </Button>
                        {/if}
                        {#if canCancel}
                            <Button secondary type="button" disabled={isCanceling} onclick={() => void onCancel()}>
                                {isCanceling ? "Canceling…" : "Cancel job"}
                            </Button>
                        {:else if canRetry}
                            <Button primary type="button" disabled={isRetrying} onclick={() => void onRetry()}>
                                {isRetrying ? "Retrying…" : "Retry"}
                            </Button>
                        {/if}
                    </div>
                {/if}
            </div>
        </div>
    </Card>

    <div class="mt-4">
        <Card>
            <h2 class="mb-2 text-sm font-medium text-foreground">Log</h2>
            {#if labelList.length > 0}
                <div class="mb-3 flex gap-1.5 overflow-x-auto">
                    {#each [null, ...labelList] as label (label ?? "all")}
                        <button
                            type="button"
                            class="shrink-0 cursor-pointer rounded-full border px-2.5 py-1 text-xs font-medium {selectedLabel ===
                            label
                                ? 'border-primary bg-primary text-primary-foreground'
                                : 'border-border text-secondary-foreground'}"
                            onclick={() => (selectedLabel = label)}>
                            {label?.split("] ").at(-1) ?? "All"}
                        </button>
                    {/each}
                </div>
            {/if}
            <div class="overflow-hidden rounded-md border border-border bg-background font-code [&_*]:font-code">
                {#if visibleLogList.length === 0}
                    <p class="px-3 py-8 text-center text-xs text-muted-foreground">No log entries yet.</p>
                {:else}
                    {#key review.id}
                        <ul class="max-h-[32rem] overflow-y-auto py-1 text-xs leading-5 tracking-tight">
                            {#each visibleLogList as row, index (row.key)}
                                {@const entry = row.entry}
                                <li class={logRowClass(entry.level, index)}>
                                    {#if entry.type === "tool-call"}
                                        {@const ToolIcon = Object.hasOwn(toolIconRecord, entry.toolName)
                                            ? toolIconRecord[entry.toolName]
                                            : WrenchIcon}
                                        <details class="group/tool">
                                            <summary
                                                class="group flex cursor-pointer list-none gap-2.5 px-2 py-0.5 [&::-webkit-details-marker]:hidden">
                                                <span class="hidden shrink-0 text-muted-foreground md:inline"
                                                    >{entry.label}</span>
                                                <ToolIcon
                                                    size={16}
                                                    class="mt-0.5 shrink-0 text-muted-foreground"
                                                    aria-hidden="true" />
                                                <span
                                                    class="min-w-0 flex-1 break-words {logLevelTextColor(entry.level)}">
                                                    <span class="block">
                                                        {transformToolName(entry.toolName)}<span
                                                            class="pointer-events-none ml-2 inline-block font-normal text-muted-foreground opacity-0 transition-opacity select-none group-hover:opacity-100 group-focus-visible:opacity-100"
                                                            >{formatLogTime(entry.timestamp)}</span>
                                                    </span>
                                                    <!-- eslint-disable svelte/no-at-html-tags -- Highlight.js escapes the argument text before adding markup -->
                                                    <code
                                                        class="whitespace-pre-wrap [&_.hljs-attr]:text-primary-text [&_.hljs-literal]:text-violet-700 dark:[&_.hljs-literal]:text-violet-300 [&_.hljs-number]:text-warning [&_.hljs-punctuation]:text-secondary-foreground [&_.hljs-string]:text-success"
                                                        >{@html row.argumentHtml}</code>
                                                    <!-- eslint-enable svelte/no-at-html-tags -->
                                                </span>
                                                <CaretRightIcon
                                                    size={14}
                                                    class="mt-0.5 shrink-0 text-muted-foreground transition-transform group-open/tool:rotate-90"
                                                    aria-hidden="true" />
                                            </summary>
                                            <div class="mx-2 pb-2">
                                                {#if row.result}
                                                    <div
                                                        class="group min-w-0 break-words {logLevelTextColor(
                                                            row.result.level,
                                                        )}">
                                                        <!-- <span class="block font-semibold">Result</span> -->
                                                        <div
                                                            class="rounded-sm border border-border bg-card px-2 py-1.5 text-secondary-foreground">
                                                            <span class="whitespace-pre-wrap"
                                                                >{row.result.message}</span>
                                                        </div>
                                                    </div>
                                                {:else}
                                                    <p class="text-muted-foreground">No result recorded.</p>
                                                {/if}
                                            </div>
                                        </details>
                                    {:else}
                                        <div class="group flex gap-2.5 px-2 py-0.5">
                                            <span class="hidden shrink-0 text-muted-foreground md:inline"
                                                >{entry.label}</span>
                                            <span class="min-w-0 flex-1 break-words {logLevelTextColor(entry.level)}">
                                                {#if entry.type === "tool-error"}
                                                    <span class="block font-semibold">Error · {entry.toolName}</span>
                                                {/if}
                                                <span class="whitespace-pre-wrap">{entry.message}</span><span
                                                    class="pointer-events-none ml-2 inline-block font-normal text-muted-foreground opacity-0 transition-opacity select-none group-hover:opacity-100"
                                                    >{formatLogTime(entry.timestamp)}</span>
                                            </span>
                                        </div>
                                    {/if}
                                </li>
                            {/each}
                        </ul>
                    {/key}
                {/if}
            </div>
        </Card>
    </div>
</DefaultLayout>

{#if review.errorMessage}
    <Modal bind:open={errorModalOpen} class="max-w-2xl">
        <h3 class="mb-3 text-lg font-semibold tracking-tight text-foreground">Error</h3>
        <pre
            class="max-h-[min(28rem,70vh)] overflow-auto rounded-md bg-destructive-muted px-3 py-2 font-mono text-xs leading-5 break-words whitespace-pre-wrap text-destructive">{review.errorMessage}</pre>
        <div class="mt-6 flex justify-end">
            <Button primary onclick={() => (errorModalOpen = false)}>Close</Button>
        </div>
    </Modal>
{/if}
