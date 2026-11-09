<script lang="ts">
    import DefaultLayout from "$lib/components/layout/DefaultLayout.svelte";
    import Card from "$lib/components/layout/Card.svelte";
    import Button from "$lib/components/atom/Button.svelte";
    import Badge from "$lib/components/atom/Badge.svelte";
    import GitProviderIcon from "$lib/components/atom/GitProviderIcon.svelte";
    import InputText from "$lib/components/atom/InputText.svelte";
    import fetchApi, { formatTimeAgo } from "$lib/utils";
    import { ArrowLeftIcon, ArrowSquareOutIcon, ArrowsClockwiseIcon, GitPullRequestIcon, FolderIcon } from "phosphor-svelte";
    import type {
        GitAccessOverviewResponse,
        GitOrganization,
        GitPagedPullRequestResponse,
        GitPagedRepositoryResponse,
        GitPullRequestItem,
        GitRepositoryDetail,
    } from "@proval/types";
    import type { PageProps } from "./$types";

    const { data }: PageProps = $props();

    const access = $derived(data.access);
    const overview = $derived<GitAccessOverviewResponse | null>(data.overview);
    const user = $derived(overview?.user ?? null);
    const organizationList = $derived<GitOrganization[]>(overview?.organizationList ?? []);

    let selectedScope = $state("personal");
    let searchQuery = $state("");

    let repoList = $state<GitRepositoryDetail[]>([]);
    let repoTotal = $state(0);
    let repoPage = $state(1);
    const repoLimit = 15;
    let isLoadingRepos = $state(false);
    let repoError = $state<string | null>(null);

    let selectedRepo = $state<GitRepositoryDetail | null>(null);

    let prList = $state<GitPullRequestItem[]>([]);
    let prTotal = $state(0);
    let prPage = $state(1);
    const prLimit = 15;
    let prState = $state<"all" | "open" | "closed" | "merged">("all");
    let isLoadingPrs = $state(false);
    let prError = $state<string | null>(null);

    const totalRepoPages = $derived(Math.max(1, Math.ceil(repoTotal / repoLimit)));
    const totalPrPages = $derived(Math.max(1, Math.ceil(prTotal / prLimit)));

    const filteredRepoList = $derived.by(() => {
        const query = searchQuery.trim().toLowerCase();
        if (!query) return repoList;
        return repoList.filter(
            (r) => r.name.toLowerCase().includes(query) || r.fullName.toLowerCase().includes(query),
        );
    });

    async function loadRepositories(scope: string, page: number) {
        isLoadingRepos = true;
        repoError = null;
        try {
            const orgParam = scope === "personal" ? "" : `&org=${encodeURIComponent(scope)}`;
            const res = await fetchApi(
                `/access/${access.id}/repository-paged?page=${page}&limit=${repoLimit}${orgParam}`,
            );
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                repoError = body.error ?? "Failed to load repositories";
                repoList = [];
                repoTotal = 0;
                return;
            }
            const result: GitPagedRepositoryResponse = await res.json();
            repoList = result.repositoryList;
            repoTotal = result.total;
            repoPage = result.page;
        } catch {
            repoError = "Network error loading repositories";
            repoList = [];
            repoTotal = 0;
        } finally {
            isLoadingRepos = false;
        }
    }

    async function loadPullRequests(repo: GitRepositoryDetail, state: "all" | "open" | "closed" | "merged", page: number) {
        isLoadingPrs = true;
        prError = null;
        try {
            const res = await fetchApi(
                `/access/${access.id}/pull-request?owner=${encodeURIComponent(repo.owner)}&repo=${encodeURIComponent(repo.name)}&state=${state}&page=${page}&limit=${prLimit}`,
            );
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                prError = body.error ?? "Failed to load pull requests";
                prList = [];
                prTotal = 0;
                return;
            }
            const result: GitPagedPullRequestResponse = await res.json();
            prList = result.pullRequestList;
            prTotal = result.total;
            prPage = result.page;
        } catch {
            prError = "Network error loading pull requests";
            prList = [];
            prTotal = 0;
        } finally {
            isLoadingPrs = false;
        }
    }

    function handleScopeChange(scope: string) {
        selectedScope = scope;
        repoPage = 1;
        selectedRepo = null;
        searchQuery = "";
        void loadRepositories(scope, 1);
    }

    function openRepository(repo: GitRepositoryDetail) {
        selectedRepo = repo;
        prPage = 1;
        prState = "all";
        void loadPullRequests(repo, "all", 1);
    }

    function handlePrStateChange(state: "all" | "open" | "closed" | "merged") {
        prState = state;
        prPage = 1;
        if (selectedRepo) {
            void loadPullRequests(selectedRepo, state, 1);
        }
    }

    $effect(() => {
        // Initial load
        void loadRepositories(selectedScope, 1);
    });
</script>

{#snippet headerActions()}
    <div class="flex items-center gap-2">
        <Button href="/provider" size="sm" class="gap-1.5 text-foreground hover:text-foreground/70">
            <ArrowLeftIcon class="size-4" />
            Back to Providers
        </Button>
    </div>
{/snippet}

<DefaultLayout title={access.name} actions={headerActions}>
    <div class="space-y-6">
        <!-- Connection Overview Card -->
        <Card border>
            <div class="flex flex-wrap items-center justify-between gap-4">
                <div class="flex items-center gap-3">
                    <GitProviderIcon provider={access.provider} boxed />
                    <div>
                        <div class="flex items-center gap-2">
                            <h2 class="text-lg font-semibold text-foreground">{access.name}</h2>
                            <Badge variant="neutral">{access.provider}</Badge>
                        </div>
                        <p class="text-sm text-muted-foreground">{access.baseUrl}</p>
                    </div>
                </div>
                {#if user}
                    <div class="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm">
                        <span class="text-muted-foreground">Authenticated as</span>
                        <span class="font-medium text-foreground">{user.fullName || user.username}</span>
                        <span class="text-xs text-muted-foreground">(@{user.username})</span>
                    </div>
                {/if}
            </div>
        </Card>

        {#if selectedRepo}
            <!-- Pull Requests View -->
            <div class="space-y-4">
                <div class="flex flex-wrap items-center justify-between gap-3">
                    <div class="flex items-center gap-2">
                        <Button text size="sm" class="gap-1" onclick={() => (selectedRepo = null)}>
                            <ArrowLeftIcon class="size-4" />
                            Repositories
                        </Button>
                        <span class="text-muted-foreground">/</span>
                        <h3 class="font-semibold text-foreground">{selectedRepo.fullName}</h3>
                        <Badge variant={selectedRepo.isPrivate ? "warning" : "neutral"}>
                            {selectedRepo.isPrivate ? "Private" : "Public"}
                        </Badge>
                    </div>
                    <div class="flex items-center gap-2">
                        {#if selectedRepo.url}
                            <a
                                href={selectedRepo.url}
                                target="_blank"
                                rel="noreferrer"
                                class="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                                Open in Gitea
                                <ArrowSquareOutIcon class="size-3.5" />
                            </a>
                        {/if}
                        <Button
                            text
                            size="sm"
                            class="gap-1"
                            disabled={isLoadingPrs}
                            onclick={() => selectedRepo && loadPullRequests(selectedRepo, prState, prPage)}>
                            <ArrowsClockwiseIcon class="size-3.5 {isLoadingPrs ? 'animate-spin' : ''}" />
                            Refresh
                        </Button>
                    </div>
                </div>

                <!-- State Filter Tabs -->
                <div class="flex flex-wrap gap-2 border-b border-border pb-2">
                    {#each ["all", "open", "closed", "merged"] as const as stateOption}
                        <button
                            type="button"
                            class="rounded-lg px-3 py-1.5 text-sm font-medium transition-colors {prState === stateOption
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-card text-muted-foreground hover:bg-accent hover:text-foreground border border-border'}"
                            onclick={() => handlePrStateChange(stateOption)}>
                            {stateOption.charAt(0).toUpperCase() + stateOption.slice(1)}
                        </button>
                    {/each}
                </div>

                <!-- Pull Request Content -->
                {#if isLoadingPrs}
                    <div class="rounded-lg border border-border bg-card p-12 text-center text-sm text-muted-foreground">
                        Loading pull requests...
                    </div>
                {:else if prError}
                    <div class="rounded-lg border border-destructive/20 bg-destructive-muted p-6 text-center text-sm text-destructive">
                        {prError}
                    </div>
                {:else if prList.length === 0}
                    <div class="rounded-lg border border-border bg-card p-12 text-center">
                        <GitPullRequestIcon class="mx-auto size-8 text-muted-foreground" />
                        <p class="mt-2 text-sm font-medium text-foreground">No pull requests found</p>
                        <p class="text-xs text-muted-foreground">
                            {prState === "all" ? "This repository has no pull requests yet." : `No pull requests with state "${prState}".`}
                        </p>
                    </div>
                {:else}
                    <div class="space-y-3">
                        {#each prList as pr (pr.id)}
                            <div class="rounded-lg border border-border bg-card p-4 transition-colors hover:border-border-strong">
                                <div class="flex items-start justify-between gap-3">
                                    <div class="min-w-0 flex-1">
                                        <div class="flex items-center gap-2">
                                            <span class="text-sm font-semibold text-muted-foreground">#{pr.number}</span>
                                            <a
                                                href={pr.url}
                                                target="_blank"
                                                rel="noreferrer"
                                                class="truncate font-medium text-foreground hover:underline">
                                                {pr.title}
                                            </a>
                                            <Badge
                                                variant={pr.state === "open"
                                                    ? "success"
                                                    : pr.state === "merged"
                                                      ? "neutral"
                                                      : "destructive"}>
                                                {pr.state.toUpperCase()}
                                            </Badge>
                                        </div>
                                        <div class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                                            <span>by {pr.author}</span>
                                            <span>
                                                {pr.sourceBranch} &rarr; {pr.targetBranch}
                                            </span>
                                            <span>Created {formatTimeAgo(pr.createdAt)}</span>
                                            <span>Updated {formatTimeAgo(pr.updatedAt)}</span>
                                        </div>
                                    </div>
                                    {#if pr.url}
                                        <a
                                            href={pr.url}
                                            target="_blank"
                                            rel="noreferrer"
                                            class="shrink-0 text-muted-foreground hover:text-foreground"
                                            aria-label="Open pull request in Gitea">
                                            <ArrowSquareOutIcon class="size-4" />
                                        </a>
                                    {/if}
                                </div>
                            </div>
                        {/each}
                    </div>

                    <!-- PR Pagination -->
                    {#if totalPrPages > 1}
                        <div class="flex items-center justify-between pt-2">
                            <span class="text-xs text-muted-foreground">
                                Showing {prList.length} of {prTotal} pull requests
                            </span>
                            <div class="flex items-center gap-2">
                                <Button
                                    text
                                    size="sm"
                                    disabled={prPage <= 1 || isLoadingPrs}
                                    onclick={() => selectedRepo && loadPullRequests(selectedRepo, prState, prPage - 1)}>
                                    Previous
                                </Button>
                                <span class="text-xs text-muted-foreground">
                                    Page {prPage} of {totalPrPages}
                                </span>
                                <Button
                                    text
                                    size="sm"
                                    disabled={prPage >= totalPrPages || isLoadingPrs}
                                    onclick={() => selectedRepo && loadPullRequests(selectedRepo, prState, prPage + 1)}>
                                    Next
                                </Button>
                            </div>
                        </div>
                    {/if}
                {/if}
            </div>
        {:else}
            <!-- Repositories View -->
            <div class="space-y-4">
                <!-- Scope Selector -->
                <div class="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
                    <div class="flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            class="rounded-lg px-3 py-1.5 text-sm font-medium transition-colors {selectedScope === 'personal'
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-card text-muted-foreground hover:bg-accent hover:text-foreground border border-border'}"
                            onclick={() => handleScopeChange('personal')}>
                            Personal ({user?.username ?? "user"})
                        </button>
                        {#each organizationList as org (org.id)}
                            <button
                                type="button"
                                class="rounded-lg px-3 py-1.5 text-sm font-medium transition-colors {selectedScope === org.username
                                    ? 'bg-primary text-primary-foreground'
                                    : 'bg-card text-muted-foreground hover:bg-accent hover:text-foreground border border-border'}"
                                onclick={() => handleScopeChange(org.username)}>
                                {org.fullName || org.username}
                            </button>
                        {/each}
                    </div>

                    <div class="flex items-center gap-2">
                        <Button
                            text
                            size="sm"
                            class="gap-1"
                            disabled={isLoadingRepos}
                            onclick={() => loadRepositories(selectedScope, repoPage)}>
                            <ArrowsClockwiseIcon class="size-3.5 {isLoadingRepos ? 'animate-spin' : ''}" />
                            Refresh
                        </Button>
                    </div>
                </div>

                <!-- Search Filter -->
                <div class="max-w-md">
                    <InputText placeholder="Search repositories..." bind:value={searchQuery} />
                </div>

                <!-- Repositories Content -->
                {#if isLoadingRepos}
                    <div class="rounded-lg border border-border bg-card p-12 text-center text-sm text-muted-foreground">
                        Loading repositories...
                    </div>
                {:else if repoError}
                    <div class="rounded-lg border border-destructive/20 bg-destructive-muted p-6 text-center text-sm text-destructive">
                        {repoError}
                    </div>
                {:else if filteredRepoList.length === 0}
                    <div class="rounded-lg border border-border bg-card p-12 text-center">
                        <FolderIcon class="mx-auto size-8 text-muted-foreground" />
                        <p class="mt-2 text-sm font-medium text-foreground">No repositories found</p>
                        <p class="text-xs text-muted-foreground">
                            {searchQuery ? "No repositories match your search criteria." : "No repositories available in this scope."}
                        </p>
                    </div>
                {:else}
                    <div class="space-y-3">
                        {#each filteredRepoList as repo (repo.id)}
                            <div class="rounded-lg border border-border bg-card p-4 transition-colors hover:border-border-strong">
                                <div class="flex flex-wrap items-start justify-between gap-3">
                                    <div class="min-w-0 flex-1">
                                        <div class="flex items-center gap-2">
                                            <span class="truncate font-semibold text-foreground">{repo.fullName}</span>
                                            <Badge variant={repo.isPrivate ? "warning" : "neutral"}>
                                                {repo.isPrivate ? "Private" : "Public"}
                                            </Badge>
                                            <Badge variant="neutral">{repo.defaultBranch}</Badge>
                                            {#if repo.alreadyConnected}
                                                <Badge variant="success">Connected</Badge>
                                            {/if}
                                        </div>
                                        {#if repo.description}
                                            <p class="mt-1 truncate text-xs text-muted-foreground">{repo.description}</p>
                                        {/if}
                                        <div class="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                                            <span>Owner: {repo.owner}</span>
                                            {#if repo.url}
                                                <a
                                                    href={repo.url}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    class="inline-flex items-center gap-0.5 hover:text-foreground hover:underline">
                                                    Open in Gitea
                                                    <ArrowSquareOutIcon class="size-3" />
                                                </a>
                                            {/if}
                                        </div>
                                    </div>
                                    <div class="flex shrink-0 items-center gap-2">
                                        <Button primary size="sm" onclick={() => openRepository(repo)}>
                                            View Pull Requests
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        {/each}
                    </div>

                    <!-- Repository Pagination -->
                    {#if totalRepoPages > 1}
                        <div class="flex items-center justify-between pt-2">
                            <span class="text-xs text-muted-foreground">
                                Showing {filteredRepoList.length} of {repoTotal} repositories
                            </span>
                            <div class="flex items-center gap-2">
                                <Button
                                    text
                                    size="sm"
                                    disabled={repoPage <= 1 || isLoadingRepos}
                                    onclick={() => loadRepositories(selectedScope, repoPage - 1)}>
                                    Previous
                                </Button>
                                <span class="text-xs text-muted-foreground">
                                    Page {repoPage} of {totalRepoPages}
                                </span>
                                <Button
                                    text
                                    size="sm"
                                    disabled={repoPage >= totalRepoPages || isLoadingRepos}
                                    onclick={() => loadRepositories(selectedScope, repoPage + 1)}>
                                    Next
                                </Button>
                            </div>
                        </div>
                    {/if}
                {/if}
            </div>
        {/if}
    </div>
</DefaultLayout>

