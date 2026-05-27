<script lang="ts">
    import ResourceCard from "$lib/components/molecule/ResourceCard.svelte";
    import Badge from "$lib/components/atom/Badge.svelte";
    import GitProviderIcon from "$lib/components/atom/GitProviderIcon.svelte";
    import { formatTimeAgo } from "$lib/utils";
    import { providerLabel, replyOptionBadge } from "$lib/utils/label";
    import type { RepositoryResponse } from "@proval/types";

    interface Props {
        repository: RepositoryResponse;
    }

    const { repository }: Props = $props();

    const pullRequestReply = $derived(replyOptionBadge("Pull Request Reply", repository.replyToMergeRequestComment));
    const issueReply = $derived(replyOptionBadge("Issue Reply", repository.replyToIssueComment));
</script>

{#snippet header()}
    <div class="flex min-w-0 flex-col gap-0.5 ml-1.5">
        <div class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <GitProviderIcon provider={repository.provider} />
            <span class="truncate text-neutral-800">{repository.path}</span>
        </div>
        {#if repository.description}
            <span class="truncate text-xs text-neutral-500">{repository.description}</span>
        {/if}
    </div>
    <span class="text-xs whitespace-nowrap text-neutral-500">
        Updated {formatTimeAgo(new Date(repository.updatedAt))}
    </span>
{/snippet}

{#snippet badges()}
    <div class="flex w-full flex-col gap-2">
        <div class="flex flex-wrap gap-1.5">
            {#if repository.reviewOnMergeRequestOpen}
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
            {#if repository.deepResearchOnMergeRequest}
                <Badge variant="warning">Deep Research</Badge>
            {/if}
            {#if repository.inlineReview}
                <Badge variant="warning">Inline Review</Badge>
            {/if}
            <Badge variant="neutral">{repository.language}</Badge>
        </div>
    </div>
{/snippet}

<ResourceCard href="/repository/{repository.id}" {header} {badges} />
