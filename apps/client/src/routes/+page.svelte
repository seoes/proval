<script lang="ts">
    import DefaultLayout from "$lib/components/layout/DefaultLayout.svelte";
    import SetupCheckList, {
        type SetupStep,
        type SetupStepStatus,
    } from "$lib/components/organism/SetupCheckList.svelte";
    import SummaryPannel from "$lib/components/molecule/SummaryPannel.svelte";
    import RepositoryCard from "$lib/components/molecule/RepositoryCard.svelte";
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

    const recentRepositories = $derived(
        [...data.repositoryList]
            .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
            .slice(0, 5),
    );

    const activeReviewCount = $derived(
        data.repositoryList.filter((repository) => repository.reviewOnMergeRequestOpen).length,
    );
</script>

<DefaultLayout title="Dashboard">
    <div class="space-y-8">
        {#if !isSetupComplete}
            <SetupCheckList
                steps={setupSteps}
                completedCount={completedSetupCount}
                totalCount={SETUP_TOTAL} />
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
                    {#each recentRepositories as repository (repository.id)}
                        <RepositoryCard {repository} />
                    {/each}
                </div>
            </div>
        {/if}
    </div>
</DefaultLayout>
