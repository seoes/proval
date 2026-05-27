<script lang="ts">
    import ResourceCard from "$lib/components/molecule/ResourceCard.svelte";
    import Badge from "$lib/components/atom/Badge.svelte";
    import { formatTimeAgo } from "$lib/utils";
    import { modelProviderLabel, truncateUrl } from "$lib/utils/label";
    import type { ModelResponse } from "@proval/types";

    interface Props {
        model: ModelResponse;
    }

    const { model }: Props = $props();
</script>

{#snippet header()}
    <div class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 ml-1.5">
        <span class="truncate text-neutral-800">{model.label}</span>
    </div>
    <span class="text-xs whitespace-nowrap text-neutral-500">
        Updated {formatTimeAgo(new Date(model.updatedAt))}
    </span>
{/snippet}

{#snippet badges()}
    <Badge variant="primary">{modelProviderLabel(model.provider)}</Badge>
    <Badge variant="neutral">{model.name}</Badge>
    <span title={model.baseUrl}>
        <Badge variant="neutral">{truncateUrl(model.baseUrl)}</Badge>
    </span>
{/snippet}

<ResourceCard href="/model/{model.id}" {header} {badges} />
