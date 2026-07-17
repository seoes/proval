<script lang="ts">
    import { onMount } from "svelte";
    import DefaultLayout from "$lib/components/layout/DefaultLayout.svelte";
    import SetupCheckList, {
        type SetupStep,
        type SetupStepStatus,
    } from "$lib/components/organism/SetupCheckList.svelte";
    import SummaryPannel from "$lib/components/molecule/SummaryPannel.svelte";
    import TokenUsagePanel from "$lib/components/molecule/TokenUsagePanel.svelte";
    import DashboardRangeToggle from "$lib/components/molecule/DashboardRangeToggle.svelte";
    import ResourceCard from "$lib/components/molecule/ResourceCard.svelte";
    import Badge from "$lib/components/atom/Badge.svelte";
    import {
        activityStatusBadge,
        activityTargetLabel,
        activityTypeLabel,
    } from "$lib/utils/label";
    import fetchApi, { formatTimeAgo } from "$lib/utils";
    import type { PageProps } from "./$types";
    import type { ActivityResponse, ActivitySummaryResponse, DashboardRange } from "@proval/types";

    const { data }: PageProps = $props();

    const SETUP_TOTAL = 3;
    const IN_PROGRESS_LIMIT = 10;
    const RANGE_STORAGE_KEY = "proval.dashboard.range";
    const VALID_RANGES: DashboardRange[] = ["24h", "7d", "30d", "mtd", "year"];

    const modelCount = $derived(data.modelList.length);
    const providerCount = $derived(data.accessList.length + data.installationList.length);
    const repositoryCount = $derived(data.repositoryList.length);

    let activitySummary = $state<ActivitySummaryResponse>(data.activitySummary);
    let selectedRange = $state<DashboardRange>(data.activitySummary.range);
    let summaryLoading = $state(false);

    function parseStoredRange(value: string | null): DashboardRange | null {
        if (value && (VALID_RANGES as string[]).includes(value)) {
            return value as DashboardRange;
        }
        return null;
    }

    async function loadSummary(range: DashboardRange) {
        summaryLoading = true;
        try {
            const response = await fetchApi(`/activity/summary?range=${range}`);
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
            localStorage.setItem(RANGE_STORAGE_KEY, range);
        } catch {
            // ignore quota / private mode
        }
        await loadSummary(range);
    }

    onMount(() => {
        let stored: DashboardRange | null = null;
        try {
            stored = parseStoredRange(localStorage.getItem(RANGE_STORAGE_KEY));
        } catch {
            stored = null;
        }
        if (stored && stored !== selectedRange) {
            void onRangeChange(stored);
        }
    });

    function resolveStepStatus(complete: boolean, blocked: boolean, isCurrent: boolean): SetupStepStatus {
        if (complete) return "complete";
        if (blocked) return "blocked";
        if (isCurrent) return "current";
        return "pending";
    }

    const setupSteps = $derived.by((): SetupStep[] => {
        const hasModel = modelCount > 0;
        const hasProvider = providerCount > 0;
        const hasRepository = repositoryCount > 0;

        const modelCurrent = !hasModel;
        const providerCurrent = !hasProvider;
        const repositoryBlocked = !hasProvider;
        const repositoryCurrent = hasProvider && !hasRepository;

        return [
            {
                id: "model-provider",
                title: "Connect a model provider",
                description: "Add a model provider for reviews and replies.",
                href: "/model-provider/create",
                ctaLabel: "Add model provider",
                manageLabel: "Manage →",
                complete: hasModel,
                status: resolveStepStatus(hasModel, false, modelCurrent),
            },
            {
                id: "provider",
                title: "Connect a Git provider",
                description: "Link GitLab, Forgejo, or GitHub.",
                href: "/provider",
                ctaLabel: "Set up provider",
                manageLabel: "Manage →",
                complete: hasProvider,
                status: resolveStepStatus(hasProvider, false, providerCurrent),
            },
            {
                id: "repository",
                title: "Add a repository",
                description: "Choose a repo and configure review policies.",
                href: "/repository/create",
                ctaLabel: "Add repository",
                manageLabel: "Manage →",
                complete: hasRepository,
                blocked: repositoryBlocked,
                blockedReason: repositoryBlocked ? "Connect a Git provider first." : undefined,
                status: resolveStepStatus(hasRepository, repositoryBlocked, repositoryCurrent),
            },
        ];
    });

    const completedSetupCount = $derived(setupSteps.filter((step) => step.complete).length);
    const isSetupComplete = $derived(completedSetupCount === SETUP_TOTAL);

    const activeReviewCount = $derived(
        data.repositoryList.filter((repository) => repository.reviewOnPullRequestOpen).length,
    );

    const stats = $derived(activitySummary.stats);
    const recentList = $derived(activitySummary.recent);
    const tokenSeries = $derived(activitySummary.tokenSeries);
    const tokensByModel = $derived(activitySummary.tokensByModel);
    const tokensByRepository = $derived(activitySummary.tokensByRepository);
    const inProgressList = $derived(activitySummary.inProgress);
    const showInProgressViewAll = $derived(inProgressList.length >= IN_PROGRESS_LIMIT);

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
                {activity.repositoryPath}
                <span class="font-normal {isFailed ? 'text-red-500' : 'text-neutral-500'}">
                    · {target} · {typeLabel}
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

<DefaultLayout title="Dashboard" actions={rangeActions}>
    <div class="space-y-8 {summaryLoading ? 'opacity-70 transition-opacity' : ''}">
        {#if !isSetupComplete}
            <SetupCheckList steps={setupSteps} completedCount={completedSetupCount} totalCount={SETUP_TOTAL} />
        {/if}

        {#if inProgressList.length > 0}
            <div>
                <div class="mb-3 flex items-center justify-between gap-4 pl-1">
                    <h3 class="text-base font-medium text-neutral-800 dark:text-white">In progress</h3>
                    {#if showInProgressViewAll}
                        <a
                            href="/review"
                            class="text-sm font-medium text-neutral-500 transition-colors hover:text-neutral-800 dark:hover:text-neutral-200">
                            View all →
                        </a>
                    {/if}
                </div>
                <div class="overflow-hidden rounded-lg border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-800">
                    {#each inProgressList as activity (activity.id)}
                        {@render activityRow(activity)}
                    {/each}
                </div>
            </div>
        {/if}

        <div>
            <div class="mb-3 flex items-center justify-between gap-4 pl-1">
                <h3 class="text-base font-medium text-neutral-800 dark:text-white">Recent Activity</h3>
                <a
                    href="/review"
                    class="text-sm font-medium text-neutral-500 transition-colors hover:text-neutral-800 dark:hover:text-neutral-200">
                    View all →
                </a>
            </div>
            <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <SummaryPannel label="Total activity" value={stats.totalActivity} />
                <SummaryPannel
                    label="Errors"
                    value={stats.errors}
                    status={stats.errors > 0 ? "error" : "neutral"} />
                <SummaryPannel label="Reviews" value={stats.reviews} />
                <SummaryPannel label="Replies" value={stats.replies} />
            </div>
            <div class="mt-3">
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

        <div>
            <div class="mb-3 pl-1">
                <h3 class="text-base font-medium text-neutral-800 dark:text-white">Token Usage</h3>
            </div>
            <TokenUsagePanel
                series={tokenSeries}
                range={selectedRange}
                byModel={tokensByModel}
                byRepository={tokensByRepository} />
        </div>

        <div class="hidden sm:block">
            <div class="mb-3 pl-1">
                <h3 class="text-base font-medium text-neutral-800 dark:text-white">Connection</h3>
            </div>
            <div class="grid gap-3 sm:grid-cols-3">
                <SummaryPannel label="Model Providers" value={modelCount} />
                <SummaryPannel label="Git Providers" value={providerCount} />
                <SummaryPannel
                    label="Projects"
                    value={repositoryCount}
                    sublabel={repositoryCount > 0 ? `${activeReviewCount} with PR review enabled` : undefined} />
            </div>
        </div>
    </div>
</DefaultLayout>
