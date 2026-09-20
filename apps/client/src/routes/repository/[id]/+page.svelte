<script lang="ts">
    import { onMount } from "svelte";
    import DefaultLayout from "$lib/components/layout/DefaultLayout.svelte";
    import SummaryPannel from "$lib/components/molecule/SummaryPannel.svelte";
    import InfoStackPanel from "$lib/components/molecule/InfoStackPanel.svelte";
    import type { InfoStackItem } from "$lib/components/molecule/InfoStackPanel.svelte";
    import TokenUsagePanel from "$lib/components/molecule/TokenUsagePanel.svelte";
    import DashboardRangeToggle from "$lib/components/molecule/DashboardRangeToggle.svelte";
    import ResourceCard from "$lib/components/molecule/ResourceCard.svelte";
    import Badge from "$lib/components/atom/Badge.svelte";
    import GitProviderIcon from "$lib/components/atom/GitProviderIcon.svelte";
    import { GearIcon } from "phosphor-svelte";
    import { activityStatusBadge, activityTargetLabel, activityTypeLabel, replyOptionBadge } from "$lib/utils/label";
    import fetchApi, { formatTimeAgo } from "$lib/utils";
    import { openAlert } from "$lib/store/modal";
    import type { PageProps } from "./$types";
    import type { ActivityResponse, ActivitySummaryResponse, DashboardRange } from "@proval/types";

    const OPEN_IN_GIT_LABEL = {
        github: "Open in GitHub",
        gitlab: "Open in GitLab",
        forgejo: "Open in Forgejo",
    } as const;

    const { data }: PageProps = $props();

    const VALID_RANGES: DashboardRange[] = ["24h", "7d", "30d", "mtd", "year"];
    const rangeStorageKey = $derived(`proval.repository.${data.repositoryId}.range`);

    let activitySummary = $state<ActivitySummaryResponse>(data.activitySummary);
    let selectedRange = $state<DashboardRange>(data.activitySummary.range);
    let summaryLoading = $state(false);
    let summaryRequestId = 0;
    let headerBlockHeight = $state(0);

    const headerIconBoxSize = $derived(Math.max(headerBlockHeight, 56));
    const headerIconSize = $derived(Math.round(headerIconBoxSize * 0.52));

    const displayTitle = $derived.by(() => {
        const description = data.repository.description?.trim();
        if (description) return description;
        const segments = data.repository.path.split("/");
        return segments[segments.length - 1] || data.repository.path;
    });

    const gitWebUrl = $derived.by(() => {
        const path = data.repository.path.replace(/^\//, "");
        if (!path) return null;
        if (data.repository.provider === "github") {
            return `https://github.com/${path}`;
        }
        if (data.provider.type === "github") {
            return null;
        }
        const base = data.provider.baseUrl.replace(/\/$/, "");
        return `${base}/${path}`;
    });

    const openInGitText = $derived(OPEN_IN_GIT_LABEL[data.repository.provider]);

    const pullRequestReply = $derived(
        replyOptionBadge(
            "Pull Request Reply",
            data.repository.prEnabled && data.repository.prReplyEnabled,
            data.repository.prMentionOnly,
        ),
    );
    const issueReply = $derived(
        replyOptionBadge(
            "Issue Reply",
            data.repository.issueEnabled && data.repository.issueReplyEnabled,
            data.repository.issueMentionOnly,
        ),
    );

    const stats = $derived(activitySummary.stats);
    const statsItemList = $derived<InfoStackItem[]>([
        {
            label: "Total activity",
            value: stats.totalActivity,
            href: `/review?repository=${data.repositoryId}`,
        },
        {
            label: "Errors",
            value: stats.errors,
            error: stats.errors > 0,
            href: `/review?status=failed&repository=${data.repositoryId}`,
        },
        { label: "Reviews", value: stats.reviews },
        { label: "Replies", value: stats.replies },
    ]);
    const recentList = $derived(activitySummary.recent);
    const tokenSeries = $derived(activitySummary.tokenSeries);
    const tokensByModel = $derived(activitySummary.tokensByModel);

    function parseStoredRange(value: string | null): DashboardRange | null {
        if (value && (VALID_RANGES as string[]).includes(value)) {
            return value as DashboardRange;
        }
        return null;
    }

    async function loadSummary(range: DashboardRange) {
        const requestId = ++summaryRequestId;
        summaryLoading = true;
        try {
            const response = await fetchApi(
                `/activity/summary?range=${range}&repository=${data.repositoryId}`,
            );
            if (!response.ok) {
                throw new Error("Failed to load summary");
            }
            const next: ActivitySummaryResponse = await response.json();
            if (requestId !== summaryRequestId) return;
            activitySummary = next;
            selectedRange = activitySummary.range;
            try {
                localStorage.setItem(rangeStorageKey, activitySummary.range);
            } catch {
                // ignore
            }
        } catch {
            if (requestId !== summaryRequestId) return;
            selectedRange = activitySummary.range;
            await openAlert("Failed to load summary");
        } finally {
            if (requestId === summaryRequestId) {
                summaryLoading = false;
            }
        }
    }

    async function onRangeChange(range: DashboardRange) {
        if (range === selectedRange) return;
        selectedRange = range;
        await loadSummary(range);
    }

    onMount(() => {
        let stored: DashboardRange | null = null;
        try {
            stored = parseStoredRange(localStorage.getItem(rangeStorageKey));
        } catch {
            stored = null;
        }
        if (stored && stored !== selectedRange) {
            void onRangeChange(stored);
        }
    });

    function activityTimeLabel(activity: ActivityResponse): string {
        return formatTimeAgo(activity.completedAt ?? activity.createdAt);
    }
</script>

{#snippet activityRow(activity: ActivityResponse)}
    {@const status = activityStatusBadge(activity.status)}
    {@const target = activityTargetLabel(activity.type, activity.targetIid)}
    {@const typeLabel = activityTypeLabel(activity.type)}
    {@const timeLabel = activityTimeLabel(activity)}
    {@const isFailed = activity.status === "failed"}
    {#snippet header()}
        <div class="min-w-0">
            <p class="truncate text-sm font-medium {isFailed ? 'text-red-700' : 'text-neutral-800'}">
                {target}
                <span class="font-normal {isFailed ? 'text-red-500' : 'text-neutral-500'}">
                    · {typeLabel}{#if activity.headSha}
                        · <span class="font-mono">{activity.headSha.slice(0, 7)}</span>{/if}
                </span>
            </p>
            {#if isFailed && activity.errorMessage}
                <p class="mt-0.5 truncate text-xs text-red-500">{activity.errorMessage}</p>
            {/if}
        </div>
    {/snippet}
    {#snippet badge()}
        <Badge variant={status.variant}>{status.label}</Badge>
        <span class="text-xs text-neutral-500 lg:hidden">{activity.modelName}</span>
        <span class="text-sm text-neutral-500 lg:hidden">{timeLabel}</span>
        <Badge variant="neutral" class="hidden lg:inline-flex">{activity.modelName}</Badge>
        <span class="hidden text-sm text-neutral-500 lg:inline">{timeLabel}</span>
    {/snippet}
    <ResourceCard
        compact
        embedded
        href="/review/{activity.id}"
        provider={activity.provider}
        class={isFailed ? "bg-red-50/60 hover:bg-red-50" : undefined}
        {header}
        {badge} />
{/snippet}

{#snippet rangeActions()}
    <DashboardRangeToggle value={selectedRange} onchange={onRangeChange} />
{/snippet}

<DefaultLayout title="Project" asideLayout actions={rangeActions}>
    <div class="space-y-8 {summaryLoading ? 'opacity-70 transition-opacity' : ''}">
        <div>
            <div class="flex flex-wrap items-start justify-between gap-4">
                <div class="flex min-w-0 items-start gap-3.5">
                    <div
                        class="flex shrink-0 items-center justify-center rounded-xl bg-neutral-100 dark:bg-neutral-800"
                        style:width="{headerIconBoxSize}px"
                        style:height="{headerIconBoxSize}px">
                        <GitProviderIcon
                            provider={data.repository.provider}
                            class="shrink-0"
                            style="width: {headerIconSize}px; height: {headerIconSize}px;" />
                    </div>
                    <div class="min-w-0" bind:clientHeight={headerBlockHeight}>
                        <h1
                            class="pl-1 text-2xl font-semibold tracking-tight text-neutral-900 dark:text-white">
                            {displayTitle}
                        </h1>
                        {#if data.repository.description?.trim()}
                            <p class="mt-1 pl-1 text-sm text-neutral-500">{data.repository.path}</p>
                        {/if}
                        <div class="mt-2 flex flex-col gap-2">
                            <div class="flex flex-wrap gap-1.5">
                                {#if data.repository.prEnabled && data.repository.prReviewEnabled}
                                    <Badge variant="success">Pull Request Review</Badge>
                                {/if}
                                {#if pullRequestReply}
                                    <Badge variant={pullRequestReply.variant}>{pullRequestReply.label}</Badge>
                                {/if}
                                {#if data.repository.issueEnabled && data.repository.issueCommentOnOpenEnabled}
                                    <Badge variant="success">Issue Review</Badge>
                                {/if}
                                {#if issueReply}
                                    <Badge variant={issueReply.variant}>{issueReply.label}</Badge>
                                {/if}
                            </div>
                            <div class="flex flex-wrap gap-1.5">
                                {#if data.repository.prEnabled && data.repository.prReviewEnabled && data.repository.prInlineReview}
                                    <Badge variant="warning">Inline Review</Badge>
                                {/if}
                                <Badge variant="neutral">{data.repository.language}</Badge>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="flex shrink-0 items-center gap-2">
                    {#if gitWebUrl}
                        <a
                            href={gitWebUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            class="inline-flex h-8 items-center rounded-lg border border-neutral-200 bg-white px-3 text-sm text-neutral-700 transition-colors hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700">
                            {openInGitText}
                        </a>
                    {/if}
                    <a
                        href="/repository/{data.repository.id}/edit"
                        class="inline-flex size-8 items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-600 transition-colors hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700"
                        aria-label="Repository settings">
                        <GearIcon class="size-4" />
                    </a>
                </div>
            </div>
        </div>

        <div class="xl:grid xl:grid-cols-[1fr_17rem] xl:items-start xl:gap-8">
            <div class="min-w-0 space-y-8">
                <div class="grid grid-cols-2 gap-3 xl:hidden">
                    <SummaryPannel
                        label="Total activity"
                        value={stats.totalActivity}
                        navHref={`/review?repository=${data.repositoryId}`} />
                    <SummaryPannel
                        label="Errors"
                        value={stats.errors}
                        status={stats.errors > 0 ? "error" : "neutral"}
                        navHref={`/review?status=failed&repository=${data.repositoryId}`} />
                    <SummaryPannel label="Reviews" value={stats.reviews} />
                    <SummaryPannel label="Replies" value={stats.replies} />
                </div>

                <div>
                    <div class="mb-3 pl-1">
                        <h3 class="text-base font-medium text-neutral-800 dark:text-white">Token Usage</h3>
                    </div>
                    <TokenUsagePanel
                        series={tokenSeries}
                        range={selectedRange}
                        byModel={tokensByModel}
                        byRepository={[]} />
                </div>

                <div>
                    <div class="mb-3 flex items-center justify-between gap-4 pl-1">
                        <h3 class="text-base font-medium text-neutral-800 dark:text-white">Recent Activity</h3>
                        <a
                            href={`/review?repository=${data.repositoryId}`}
                            class="text-sm font-medium text-neutral-500 transition-colors hover:text-neutral-800 dark:hover:text-neutral-200">
                            View all →
                        </a>
                    </div>
                    {#if recentList.length === 0}
                        <div
                            class="rounded-lg border border-neutral-200 bg-white px-6 py-10 text-center dark:border-neutral-700 dark:bg-neutral-800">
                            <p class="text-sm text-neutral-500">No activity in this period.</p>
                        </div>
                    {:else}
                        <div
                            class="overflow-hidden rounded-lg border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-800">
                            {#each recentList as activity (activity.id)}
                                {@render activityRow(activity)}
                            {/each}
                        </div>
                    {/if}
                </div>
            </div>

            <aside class="hidden xl:block">
                <InfoStackPanel itemList={statsItemList} />
            </aside>
        </div>
    </div>
</DefaultLayout>
