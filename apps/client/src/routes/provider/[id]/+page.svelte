<script lang="ts">
    import { untrack } from "svelte";
    import DefaultLayout from "$lib/components/layout/DefaultLayout.svelte";
    import Card from "$lib/components/layout/Card.svelte";
    import Button from "$lib/components/atom/Button.svelte";
    import Badge from "$lib/components/atom/Badge.svelte";
    import GitProviderIcon from "$lib/components/atom/GitProviderIcon.svelte";
    import InputText from "$lib/components/atom/InputText.svelte";
    import fetchApi, { formatTimeAgo } from "$lib/utils";
    import {
        ArrowLeftIcon,
        ArrowSquareOutIcon,
        ArrowsClockwiseIcon,
        GitPullRequestIcon,
        FolderIcon,
        CaretDownIcon,
        CaretRightIcon,
        FileCodeIcon,
        GitCommitIcon,
        GitBranchIcon,
    } from "phosphor-svelte";
    import type {
        GitAccessOverviewResponse,
        GitOrganization,
        GitPagedPullRequestResponse,
        GitPagedRepositoryResponse,
        GitPullRequestDiffResponse,
        GitPullRequestFile,
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

    // Pull Request Detail and Diff View
    let selectedPr = $state<GitPullRequestItem | null>(null);
    let prDetail = $state<GitPullRequestDiffResponse | null>(null);
    let isLoadingPrDetail = $state(false);
    let prDetailError = $state<string | null>(null);
    let collapsedFiles = $state<Record<string, boolean>>({});
    let fileFilterQuery = $state("");

    const totalRepoPages = $derived(Math.max(1, Math.ceil(repoTotal / repoLimit)));
    const totalPrPages = $derived(Math.max(1, Math.ceil(prTotal / prLimit)));

    const filteredRepoList = $derived.by(() => {
        const query = searchQuery.trim().toLowerCase();
        if (!query) return repoList;
        return repoList.filter(
            (r) => r.name.toLowerCase().includes(query) || r.fullName.toLowerCase().includes(query),
        );
    });

    const filteredFileList = $derived.by(() => {
        if (!prDetail?.fileList) return [];
        const query = fileFilterQuery.trim().toLowerCase();
        if (!query) return prDetail.fileList;
        return prDetail.fileList.filter(
            (f) =>
                f.filename.toLowerCase().includes(query) ||
                (f.previousFilename && f.previousFilename.toLowerCase().includes(query)),
        );
    });

    let repoRequestId = 0;
    let prRequestId = 0;
    let prDetailRequestId = 0;
    let repoAbortController: AbortController | null = null;
    let prAbortController: AbortController | null = null;
    let prDetailAbortController: AbortController | null = null;

    function cancelPrRequest() {
        prRequestId += 1;
        prAbortController?.abort();
        prAbortController = null;
        isLoadingPrs = false;
    }

    function cancelPrDetailRequest() {
        prDetailRequestId += 1;
        prDetailAbortController?.abort();
        prDetailAbortController = null;
        isLoadingPrDetail = false;
    }

    async function loadRepositories(scope: string, page: number) {
        repoAbortController?.abort();
        const controller = new AbortController();
        repoAbortController = controller;
        const requestId = ++repoRequestId;

        isLoadingRepos = true;
        repoError = null;
        try {
            const orgParam = scope === "personal" ? "" : `&org=${encodeURIComponent(scope)}`;
            const res = await fetchApi(
                `/access/${access.id}/repository-paged?page=${page}&limit=${repoLimit}${orgParam}`,
                { signal: controller.signal },
            );
            if (requestId !== repoRequestId || controller.signal.aborted) {
                return;
            }
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                if (requestId !== repoRequestId || controller.signal.aborted) {
                    return;
                }
                repoError = body.error ?? "Failed to load repositories";
                repoList = [];
                repoTotal = 0;
                return;
            }
            const result: GitPagedRepositoryResponse = await res.json();
            if (requestId !== repoRequestId || controller.signal.aborted || scope !== selectedScope) {
                return;
            }
            repoList = result.repositoryList;
            repoTotal = result.total;
            repoPage = result.page;
        } catch (error) {
            if (
                requestId !== repoRequestId ||
                controller.signal.aborted ||
                (error instanceof DOMException && error.name === "AbortError")
            ) {
                return;
            }
            repoError = "Network error loading repositories";
            repoList = [];
            repoTotal = 0;
        } finally {
            if (requestId === repoRequestId) {
                isLoadingRepos = false;
                repoAbortController = null;
            }
        }
    }

    async function loadPullRequests(repo: GitRepositoryDetail, state: "all" | "open" | "closed" | "merged", page: number) {
        prAbortController?.abort();
        const controller = new AbortController();
        prAbortController = controller;
        const requestId = ++prRequestId;

        isLoadingPrs = true;
        prError = null;
        try {
            const res = await fetchApi(
                `/access/${access.id}/pull-request?owner=${encodeURIComponent(repo.owner)}&repo=${encodeURIComponent(repo.name)}&state=${state}&page=${page}&limit=${prLimit}`,
                { signal: controller.signal },
            );
            if (requestId !== prRequestId || controller.signal.aborted) {
                return;
            }
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                if (requestId !== prRequestId || controller.signal.aborted) {
                    return;
                }
                prError = body.error ?? "Failed to load pull requests";
                prList = [];
                prTotal = 0;
                return;
            }
            const result: GitPagedPullRequestResponse = await res.json();
            if (
                requestId !== prRequestId ||
                controller.signal.aborted ||
                selectedRepo?.id !== repo.id ||
                prState !== state
            ) {
                return;
            }
            prList = result.pullRequestList;
            prTotal = result.total;
            prPage = result.page;
        } catch (error) {
            if (
                requestId !== prRequestId ||
                controller.signal.aborted ||
                (error instanceof DOMException && error.name === "AbortError")
            ) {
                return;
            }
            prError = "Network error loading pull requests";
            prList = [];
            prTotal = 0;
        } finally {
            if (requestId === prRequestId) {
                isLoadingPrs = false;
                prAbortController = null;
            }
        }
    }

    async function openPullRequest(pr: GitPullRequestItem) {
        if (!selectedRepo) return;
        const repo = selectedRepo;

        prDetailAbortController?.abort();
        const controller = new AbortController();
        prDetailAbortController = controller;
        const requestId = ++prDetailRequestId;

        selectedPr = pr;
        isLoadingPrDetail = true;
        prDetailError = null;
        prDetail = null;
        collapsedFiles = {};
        fileFilterQuery = "";
        try {
            const res = await fetchApi(
                `/access/${access.id}/pull-request-detail?owner=${encodeURIComponent(repo.owner)}&repo=${encodeURIComponent(repo.name)}&index=${pr.number}`,
                { signal: controller.signal },
            );
            if (requestId !== prDetailRequestId || controller.signal.aborted) {
                return;
            }
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                if (requestId !== prDetailRequestId || controller.signal.aborted) {
                    return;
                }
                prDetailError = body.message ?? body.error ?? "Failed to load pull request details and diff";
                return;
            }
            const detail: GitPullRequestDiffResponse = await res.json();
            if (
                requestId !== prDetailRequestId ||
                controller.signal.aborted ||
                selectedRepo?.id !== repo.id ||
                selectedPr?.number !== pr.number
            ) {
                return;
            }
            prDetail = detail;
        } catch (error) {
            if (
                requestId !== prDetailRequestId ||
                controller.signal.aborted ||
                (error instanceof DOMException && error.name === "AbortError")
            ) {
                return;
            }
            prDetailError = "Network error loading pull request details and diff";
        } finally {
            if (requestId === prDetailRequestId) {
                isLoadingPrDetail = false;
                prDetailAbortController = null;
            }
        }
    }

    function backToPullRequests() {
        cancelPrDetailRequest();
        selectedPr = null;
        prDetail = null;
        prDetailError = null;
    }

    function backToRepositories() {
        cancelPrDetailRequest();
        cancelPrRequest();
        selectedPr = null;
        prDetail = null;
        prDetailError = null;
        selectedRepo = null;
        prList = [];
        prTotal = 0;
        prError = null;
    }

    function handleScopeChange(scope: string) {
        cancelPrDetailRequest();
        cancelPrRequest();
        selectedRepo = null;
        selectedPr = null;
        prDetail = null;
        prDetailError = null;
        prList = [];
        prTotal = 0;
        prError = null;
        searchQuery = "";
        repoPage = 1;
        if (selectedScope === scope) {
            void loadRepositories(scope, 1);
            return;
        }
        selectedScope = scope;
    }

    function openRepository(repo: GitRepositoryDetail) {
        cancelPrDetailRequest();
        selectedRepo = repo;
        selectedPr = null;
        prDetail = null;
        prDetailError = null;
        prPage = 1;
        prState = "all";
        void loadPullRequests(repo, "all", 1);
    }

    function handlePrStateChange(state: "all" | "open" | "closed" | "merged") {
        cancelPrDetailRequest();
        prState = state;
        prPage = 1;
        if (selectedRepo) {
            void loadPullRequests(selectedRepo, state, 1);
        }
    }

    function toggleFileCollapse(filename: string) {
        collapsedFiles[filename] = !collapsedFiles[filename];
    }

    function statusBadgeVariant(status: string): "success" | "neutral" | "destructive" | "warning" {
        switch (status.toLowerCase()) {
            case "added":
                return "success";
            case "deleted":
            case "removed":
                return "destructive";
            case "renamed":
                return "warning";
            default:
                return "neutral";
        }
    }

    $effect(() => {
        const currentAccessId = access.id;
        const scope = selectedScope;
        void currentAccessId;
        untrack(() => {
            void loadRepositories(scope, 1);
        });
        return () => {
            repoAbortController?.abort();
            prAbortController?.abort();
            prDetailAbortController?.abort();
        };
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

        {#if selectedPr}
            <!-- Pull Request Detail and Diff View -->
            <div class="space-y-5">
                <div class="flex flex-wrap items-center justify-between gap-3">
                    <div class="flex items-center gap-2">
                        <Button text size="sm" class="gap-1" onclick={backToPullRequests}>
                            <ArrowLeftIcon class="size-4" />
                            Pull Requests
                        </Button>
                        <span class="text-muted-foreground">/</span>
                        <span class="text-xs font-mono font-semibold text-muted-foreground">#{selectedPr.number}</span>
                        <h3 class="font-semibold text-foreground truncate max-w-md">{selectedPr.title}</h3>
                        <Badge
                            variant={selectedPr.state === "open"
                                ? "success"
                                : selectedPr.state === "merged"
                                  ? "neutral"
                                  : "destructive"}>
                            {selectedPr.state.toUpperCase()}
                        </Badge>
                    </div>
                    <div class="flex items-center gap-2">
                        {#if selectedPr.url}
                            <a
                                href={selectedPr.url}
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
                            disabled={isLoadingPrDetail}
                            onclick={() => selectedPr && openPullRequest(selectedPr)}>
                            <ArrowsClockwiseIcon class="size-3.5 {isLoadingPrDetail ? 'animate-spin' : ''}" />
                            Refresh
                        </Button>
                    </div>
                </div>

                {#if isLoadingPrDetail}
                    <div class="rounded-lg border border-border bg-card p-12 text-center text-sm text-muted-foreground">
                        Loading pull request details and diff...
                    </div>
                {:else if prDetailError}
                    <div class="rounded-lg border border-destructive/20 bg-destructive-muted p-6 text-center text-sm text-destructive">
                        <p class="font-medium">{prDetailError}</p>
                        <Button text size="sm" class="mt-3" onclick={() => selectedPr && openPullRequest(selectedPr)}>
                            Retry
                        </Button>
                    </div>
                {:else if prDetail}
                    <!-- PR Metadata Card -->
                    <Card border>
                        <div class="space-y-3">
                            <div class="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
                                <div class="flex flex-wrap items-center gap-3 text-sm">
                                    <span class="font-medium text-foreground">Author: {prDetail.pullRequest.author}</span>
                                    <span class="text-muted-foreground">&bull;</span>
                                    <span class="inline-flex items-center gap-1 font-mono text-xs bg-muted px-2 py-0.5 rounded">
                                        <GitBranchIcon class="size-3" />
                                        {prDetail.pullRequest.sourceBranch} &rarr; {prDetail.pullRequest.targetBranch}
                                    </span>
                                    {#if prDetail.pullRequest.headSha}
                                        <span class="inline-flex items-center gap-1 font-mono text-xs text-muted-foreground">
                                            <GitCommitIcon class="size-3" />
                                            {prDetail.pullRequest.headSha.slice(0, 7)}
                                        </span>
                                    {/if}
                                </div>
                                <div class="flex items-center gap-3 text-xs">
                                    <span class="font-semibold text-emerald-600 dark:text-emerald-400">+{prDetail.pullRequest.additions}</span>
                                    <span class="font-semibold text-rose-600 dark:text-rose-400">-{prDetail.pullRequest.deletions}</span>
                                    <span class="text-muted-foreground">{prDetail.totalFileCount} files changed</span>
                                    {#if prDetail.isTruncated}
                                        <Badge variant="warning">Diff Truncated</Badge>
                                    {/if}
                                </div>
                            </div>

                            <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                                <span>Created {formatTimeAgo(prDetail.pullRequest.createdAt)}</span>
                                <span>Updated {formatTimeAgo(prDetail.pullRequest.updatedAt)}</span>
                                {#if prDetail.pullRequest.mergedAt}
                                    <span class="text-foreground">Merged {formatTimeAgo(prDetail.pullRequest.mergedAt)}</span>
                                {/if}
                            </div>

                            {#if prDetail.pullRequest.body}
                                <div class="mt-2 rounded-lg border border-border/70 bg-muted/20 p-3 text-xs text-foreground whitespace-pre-wrap font-sans">
                                    {prDetail.pullRequest.body}
                                </div>
                            {/if}
                        </div>
                    </Card>

                    <!-- Modified Files Summary & Filter -->
                    <Card border>
                        <div class="space-y-3">
                            <div class="flex flex-wrap items-center justify-between gap-3">
                                <h4 class="font-semibold text-sm text-foreground">
                                    Modified Files ({prDetail.fileList.length})
                                </h4>
                                <div class="w-64">
                                    <InputText
                                        placeholder="Filter files..."
                                        bind:value={fileFilterQuery}
                                        size="sm" />
                                </div>
                            </div>

                            {#if filteredFileList.length === 0}
                                <p class="text-xs text-muted-foreground py-2">No files match the filter.</p>
                            {:else}
                                <div class="divide-y divide-border border border-border rounded-lg overflow-hidden bg-card text-xs">
                                    {#each filteredFileList as file (file.filename)}
                                        <div class="flex items-center justify-between p-2.5 hover:bg-muted/40 transition-colors">
                                            <div class="flex items-center gap-2 min-w-0">
                                                <Badge variant={statusBadgeVariant(file.status)}>
                                                    {file.status.toUpperCase()}
                                                </Badge>
                                                <span class="font-mono text-xs text-foreground truncate">
                                                    {#if file.previousFilename}
                                                        <span class="text-muted-foreground">{file.previousFilename} &rarr; </span>
                                                    {/if}
                                                    {file.filename}
                                                </span>
                                                {#if file.isBinary}
                                                    <Badge variant="neutral">Binary</Badge>
                                                {/if}
                                                {#if file.isTruncated}
                                                    <Badge variant="warning">Large</Badge>
                                                {/if}
                                            </div>
                                            <div class="flex items-center gap-2 shrink-0 font-mono text-xs">
                                                <span class="text-emerald-600 dark:text-emerald-400">+{file.additions}</span>
                                                <span class="text-rose-600 dark:text-rose-400">-{file.deletions}</span>
                                                <Button
                                                    text
                                                    size="sm"
                                                    onclick={() => toggleFileCollapse(file.filename)}>
                                                    {collapsedFiles[file.filename] ? "Expand" : "Collapse"}
                                                </Button>
                                            </div>
                                        </div>
                                    {/each}
                                </div>
                            {/if}
                        </div>
                    </Card>

                    <!-- File Diffs List -->
                    <div class="space-y-4">
                        {#each filteredFileList as file (file.filename)}
                            <div class="rounded-lg border border-border bg-card overflow-hidden">
                                <!-- File Diff Header -->
                                <div
                                    class="flex items-center justify-between px-3.5 py-2.5 bg-muted/40 border-b border-border cursor-pointer select-none"
                                    onclick={() => toggleFileCollapse(file.filename)}>
                                    <div class="flex items-center gap-2 min-w-0">
                                        {#if collapsedFiles[file.filename]}
                                            <CaretRightIcon class="size-3.5 text-muted-foreground shrink-0" />
                                        {:else}
                                            <CaretDownIcon class="size-3.5 text-muted-foreground shrink-0" />
                                        {/if}
                                        <Badge variant={statusBadgeVariant(file.status)}>
                                            {file.status.toUpperCase()}
                                        </Badge>
                                        <span class="font-mono text-xs font-semibold text-foreground truncate">
                                            {#if file.previousFilename}
                                                <span class="text-muted-foreground">{file.previousFilename} &rarr; </span>
                                            {/if}
                                            {file.filename}
                                        </span>
                                    </div>
                                    <div class="flex items-center gap-2.5 font-mono text-xs shrink-0">
                                        <span class="text-emerald-600 dark:text-emerald-400">+{file.additions}</span>
                                        <span class="text-rose-600 dark:text-rose-400">-{file.deletions}</span>
                                    </div>
                                </div>

                                <!-- File Diff Body -->
                                {#if !collapsedFiles[file.filename]}
                                    {#if file.isBinary}
                                        <div class="p-6 text-center text-xs text-muted-foreground">
                                            Binary file not shown
                                        </div>
                                    {:else if file.isTruncated && !file.patch}
                                        <div class="p-4 text-xs text-amber-600 dark:text-amber-400 bg-amber-500/10 text-center font-medium">
                                            Diff exceeds display size limit and was truncated
                                        </div>
                                    {:else if !file.patch}
                                        <div class="p-4 text-center text-xs text-muted-foreground">
                                            No text changes to display
                                        </div>
                                    {:else}
                                        <div class="overflow-x-auto font-mono text-xs">
                                            {#each file.patch.split("\n") as line}
                                                {#if line.startsWith("@@")}
                                                    <div class="bg-muted/70 px-3 py-1 font-medium text-muted-foreground border-y border-border select-none">
                                                        {line}
                                                    </div>
                                                {:else if line.startsWith("+")}
                                                    <div class="bg-emerald-500/10 px-3 py-0.5 text-emerald-700 dark:text-emerald-400 border-l-2 border-emerald-500 whitespace-pre">
                                                        {line}
                                                    </div>
                                                {:else if line.startsWith("-")}
                                                    <div class="bg-rose-500/10 px-3 py-0.5 text-rose-700 dark:text-rose-400 border-l-2 border-rose-500 whitespace-pre">
                                                        {line}
                                                    </div>
                                                {:else}
                                                    <div class="px-3 py-0.5 text-foreground/80 border-l-2 border-transparent whitespace-pre">
                                                        {line}
                                                    </div>
                                                {/if}
                                            {/each}
                                        </div>
                                    {/if}
                                {/if}
                            </div>
                        {/each}
                    </div>
                {/if}
            </div>
        {:else if selectedRepo}
            <!-- Pull Requests View -->
            <div class="space-y-4">
                <div class="flex flex-wrap items-center justify-between gap-3">
                    <div class="flex items-center gap-2">
                        <Button text size="sm" class="gap-1" onclick={backToRepositories}>
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
                                            <button
                                                type="button"
                                                onclick={() => openPullRequest(pr)}
                                                class="truncate font-medium text-foreground hover:underline text-left">
                                                {pr.title}
                                            </button>
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
                                    <div class="flex items-center gap-2 shrink-0">
                                        <Button
                                            size="sm"
                                            class="text-xs"
                                            onclick={() => openPullRequest(pr)}>
                                            View Diff
                                        </Button>
                                        {#if pr.url}
                                            <a
                                                href={pr.url}
                                                target="_blank"
                                                rel="noreferrer"
                                                class="text-muted-foreground hover:text-foreground"
                                                aria-label="Open pull request in Gitea">
                                                <ArrowSquareOutIcon class="size-4" />
                                            </a>
                                        {/if}
                                    </div>
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

                <!-- Search Input -->
                <div class="max-w-md">
                    <InputText
                        placeholder="Search repositories..."
                        bind:value={searchQuery} />
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
                            {searchQuery ? "No repositories match your search." : "This scope has no repositories yet."}
                        </p>
                    </div>
                {:else}
                    <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {#each filteredRepoList as repo (repo.id)}
                            <div class="flex flex-col justify-between rounded-lg border border-border bg-card p-4 transition-colors hover:border-border-strong">
                                <div>
                                    <div class="flex items-start justify-between gap-2">
                                        <button
                                            type="button"
                                            class="text-left font-semibold text-foreground hover:underline truncate"
                                            onclick={() => openRepository(repo)}>
                                            {repo.name}
                                        </button>
                                        <Badge variant={repo.isPrivate ? "warning" : "neutral"}>
                                            {repo.isPrivate ? "Private" : "Public"}
                                        </Badge>
                                    </div>
                                    <p class="mt-1 text-xs text-muted-foreground font-mono truncate">{repo.fullName}</p>
                                    {#if repo.description}
                                        <p class="mt-2 line-clamp-2 text-xs text-muted-foreground">
                                            {repo.description}
                                        </p>
                                    {/if}
                                </div>

                                <div class="mt-4 flex items-center justify-between border-t border-border pt-3">
                                    <span class="text-xs text-muted-foreground">
                                        Branch: <span class="font-mono">{repo.defaultBranch}</span>
                                    </span>
                                    <div class="flex items-center gap-2">
                                        {#if repo.url}
                                            <a
                                                href={repo.url}
                                                target="_blank"
                                                rel="noreferrer"
                                                class="text-muted-foreground hover:text-foreground"
                                                aria-label="Open in Gitea">
                                                <ArrowSquareOutIcon class="size-4" />
                                            </a>
                                        {/if}
                                        <Button size="sm" onclick={() => openRepository(repo)}>
                                            View PRs
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        {/each}
                    </div>

                    <!-- Repositories Pagination -->
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
