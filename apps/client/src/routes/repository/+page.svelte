<script lang="ts">
    import ResourceCard from "$lib/components/molecule/ResourceCard.svelte";
    import Badge from "$lib/components/atom/Badge.svelte";
    import { PlusIcon } from "phosphor-svelte";
    import { replyOptionBadge } from "$lib/utils/label";
    import type { PageProps } from "./$types";
    import DefaultLayout from "$lib/components/layout/DefaultLayout.svelte";
    import { formatTimeAgo } from "$lib/utils";

    const { data }: PageProps = $props();
</script>

{#snippet addRepositoryAction()}
    <a
        href="/repository/create"
        class="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-neutral-900 transition-colors hover:text-neutral-900/70">
        <PlusIcon class="size-4" />
        Add Repository
    </a>
{/snippet}

<DefaultLayout title="Repository" actions={addRepositoryAction}>
    {#if data.repositoryList.length === 0}
        <div class="rounded-lg border border-neutral-200 bg-white px-6 py-14 text-center">
            <p class="text-sm text-neutral-500">No repositories connected yet.</p>
            <a
                href="/repository/create"
                class="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90">
                <PlusIcon class="size-4" />
                Add your first repository
            </a>
        </div>
    {:else}
        <div class="space-y-3">
            {#each data.repositoryList as repository (repository.id)}
                {@const pullRequestReply = replyOptionBadge("Pull Request Reply", repository.replyToPullRequestComment)}
                {@const issueReply = replyOptionBadge("Issue Reply", repository.replyToIssueComment)}
                {#snippet header()}
                    <div class="flex items-center justify-between">
                        <div class="ml-1.5 flex min-w-0 flex-col gap-0.5">
                            <span class="truncate text-neutral-800">{repository.path}</span>
                            {#if repository.description}
                                <span class="truncate text-xs text-neutral-500">{repository.description}</span>
                            {/if}
                        </div>
                        {#if repository.lastUsedAt}
                            <span class="text-sm text-neutral-500"
                                >Last activity: {formatTimeAgo(repository.lastUsedAt)}</span>
                        {:else}
                            <span class="text-sm text-neutral-500">Not used</span>
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
                <ResourceCard href="/repository/{repository.id}" provider={repository.provider} {header} {badge} />
            {/each}
        </div>
    {/if}
</DefaultLayout>
