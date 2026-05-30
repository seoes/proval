<script lang="ts">
    import DefaultLayout from "$lib/components/layout/DefaultLayout.svelte";
    import SetupCheckList, {
        type SetupStep,
        type SetupStepStatus,
    } from "$lib/components/organism/SetupCheckList.svelte";
    import SummaryPannel from "$lib/components/molecule/SummaryPannel.svelte";
    import ResourceCard from "$lib/components/molecule/ResourceCard.svelte";
    import Badge from "$lib/components/atom/Badge.svelte";
    import { replyOptionBadge } from "$lib/utils/label";
    import type { PageProps } from "./$types";

    const { data }: PageProps = $props();

    const SETUP_TOTAL = 3;

    const modelCount = $derived(data.modelList.length);
    const providerCount = $derived(data.accessList.length + data.installationList.length);
    const repositoryCount = $derived(data.repositoryList.length);

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
                id: "model",
                title: "Connect a model",
                description: "Add an LLM endpoint for reviews and replies.",
                href: "/model/create",
                ctaLabel: "Add model",
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

    const recentRepositoryList = $derived(data.repositoryList.slice(0, 5));

    const activeReviewCount = $derived(
        data.repositoryList.filter((repository) => repository.reviewOnPullRequestOpen).length,
    );
</script>

<DefaultLayout title="Dashboard">
    <div class="space-y-8">
        {#if !isSetupComplete}
            <SetupCheckList steps={setupSteps} completedCount={completedSetupCount} totalCount={SETUP_TOTAL} />
        {/if}

        <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <SummaryPannel
                label="Models"
                value={modelCount}
                href="/model"
                actionLabel={modelCount > 0 ? "Manage →" : "Add →"} />
            <SummaryPannel
                label="Git Providers"
                value={providerCount}
                href="/provider"
                actionLabel={providerCount > 0 ? "Manage →" : "Set up →"} />
            <SummaryPannel
                label="Repositories"
                value={repositoryCount}
                sublabel={repositoryCount > 0 ? `${activeReviewCount} with PR review enabled` : undefined}
                href="/repository"
                actionLabel={repositoryCount > 0 ? "Manage →" : "Add →"} />
        </div>

        {#if repositoryCount > 0}
            <div>
                <div class="mb-3 flex items-center justify-between gap-4 pl-1">
                    <h3 class="text-md font-medium text-neutral-800 dark:text-white">Repositories</h3>
                    <a
                        href="/repository"
                        class="text-sm font-medium text-neutral-500 transition-colors hover:text-neutral-800 dark:hover:text-neutral-200">
                        View all →
                    </a>
                </div>
                <div class="space-y-3">
                    {#each recentRepositoryList as repository (repository.id)}
                        {@const pullRequestReply = replyOptionBadge(
                            "Pull Request Reply",
                            repository.replyToPullRequestComment,
                        )}
                        {@const issueReply = replyOptionBadge("Issue Reply", repository.replyToIssueComment)}
                        {#snippet header()}
                            <div class="ml-1.5 flex min-w-0 flex-col gap-0.5">
                                <span class="truncate text-neutral-800">{repository.path}</span>
                                {#if repository.description}
                                    <span class="truncate text-xs text-neutral-500">{repository.description}</span>
                                {/if}
                            </div>
                        {/snippet}
                        {#snippet badge()}
                            <div class="flex w-full flex-col gap-2">
                                <div class="flex flex-wrap gap-1.5">
                                    {#if repository.reviewOnPullRequestOpen}
                                        <Badge variant="success">Pull Request Review</Badge>
                                    {/if}
                                    {#if pullRequestReply}
                                        <Badge variant={pullRequestReply.variant}>{pullRequestReply.label}</Badge>
                                    {/if}
                                    {#if repository.commentOnIssueOpen}
                                        <Badge variant="success">Issue Review</Badge>
                                    {/if}
                                    {#if issueReply}
                                        <Badge variant={issueReply.variant}>{issueReply.label}</Badge>
                                    {/if}
                                </div>
                                <div class="flex flex-wrap gap-1.5">
                                    {#if repository.deepResearchOnPullRequest}
                                        <Badge variant="warning">Deep Research</Badge>
                                    {/if}
                                    {#if repository.inlineReview}
                                        <Badge variant="warning">Inline Review</Badge>
                                    {/if}
                                    <Badge variant="neutral">{repository.language}</Badge>
                                </div>
                            </div>
                        {/snippet}
                        <ResourceCard
                            href="/repository/{repository.id}"
                            provider={repository.provider}
                            {header}
                            {badge} />
                    {/each}
                </div>
            </div>
        {/if}
    </div>
</DefaultLayout>
