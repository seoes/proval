<script lang="ts">
    import { onMount } from "svelte";
    import DefaultLayout from "$lib/components/layout/DefaultLayout.svelte";
    import SummaryPannel from "$lib/components/molecule/SummaryPannel.svelte";
    import TokenUsagePanel from "$lib/components/molecule/TokenUsagePanel.svelte";
    import DashboardRangeToggle from "$lib/components/molecule/DashboardRangeToggle.svelte";
    import ResourceCard from "$lib/components/molecule/ResourceCard.svelte";
    import Badge from "$lib/components/atom/Badge.svelte";
    import GitProviderIcon from "$lib/components/atom/GitProviderIcon.svelte";
    import { GearIcon } from "phosphor-svelte";
    import { activityStatusBadge, activityTargetLabel, activityTypeLabel } from "$lib/utils/label";
    import fetchApi, { formatTimeAgo } from "$lib/utils";
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
    const reviewListHref = $derived(`/review?repository=${data.repositoryId}`);

    const stats = $derived(activitySummary.stats);
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
        summaryLoading = true;
        try {
            const response = await fetchApi(
                `/activity/summary?range=${range}&repository=${data.repositoryId}`,
            );
            if (response.ok) {
                activitySummary = await response.json();
                selectedRange = activitySummary.range;
            }
        } finally {
            summaryLoading = false;
        }
    }

    async function onRangeChange(range: DashboardRange) {
        if (range === selectedRange) return;
        selectedRange = range;
        try {
            localStorage.setItem(rangeStorageKey, range);
        } catch {
            // ignore
        }
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

<DefaultLayout title="Project" actions={rangeActions}>
    <div class="space-y-8 {summaryLoading ? 'opacity-70 transition-opacity' : ''}">
        <div>
            <div class="flex flex-wrap items-start justify-between gap-4">
                <div class="flex min-w-0 items-stretch gap-3.5">
                    <GitProviderIcon
                        provider={data.repository.provider}
                        boxed
                        class="!size-auto w-14 shrink-0 self-stretch rounded-xl"
                        iconClass="size-9" />
                    <div class="min-w-0">
                        <h1 class="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-white">
                            {displayTitle}
                        </h1>
                        {#if data.repository.description?.trim()}
                            <p class="mt-1 text-sm text-neutral-500">{data.repository.path}</p>
                        {:else}
                            <p class="mt-1 text-sm text-neutral-500">{data.repository.language}</p>
                        {/if}
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

        <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <SummaryPannel label="Total activity" value={stats.totalActivity} />
            <SummaryPannel label="Errors" value={stats.errors} status={stats.errors > 0 ? "error" : "neutral"} />
            <SummaryPannel label="Reviews" value={stats.reviews} />
            <SummaryPannel label="Replies" value={stats.replies} />
        </div>

        <div>
            <div class="mb-3 pl-1">
                <h3 class="text-base font-medium text-neutral-800 dark:text-white">Token Usage</h3>
            </div>
            <TokenUsagePanel series={tokenSeries} range={selectedRange} byModel={tokensByModel} byRepository={[]} />
        </div>

        <div>
            <div class="mb-3 flex items-center justify-between gap-4 pl-1">
                <h3 class="text-base font-medium text-neutral-800 dark:text-white">Recent Activity</h3>
                <a
                    href={reviewListHref}
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
</DefaultLayout>
