<script lang="ts">
    import ResourceCard from "$lib/components/molecule/ResourceCard.svelte";
    import Badge from "$lib/components/atom/Badge.svelte";
    import Popover from "$lib/components/atom/Popover.svelte";
    import Modal from "$lib/components/atom/Modal.svelte";
    import PatchSecret from "$lib/components/molecule/PatchSecret.svelte";
    import { GearIcon, LockIcon } from "phosphor-svelte";
    import { formatTimeAgo } from "$lib/utils";
    import { modelProviderLabel, truncateUrl } from "$lib/utils/label";
    import type { ModelResponse } from "@proval/types";

    interface Props {
        model: ModelResponse;
    }

    const { model }: Props = $props();

    let updateApiKeyModalOpen = $state(false);
</script>

{#snippet header()}
    <div class="flex min-w-0 items-center gap-3">
        <span class="truncate text-neutral-800">{model.label}</span>
    </div>
    <div class="flex shrink-0 items-center gap-3">
        <span class="text-xs whitespace-nowrap text-neutral-500">
            Updated {formatTimeAgo(new Date(model.updatedAt))}
        </span>
        <a
            class="text-neutral-500 transition-colors hover:text-neutral-800"
            href="/model/{model.id}"
            aria-label="Settings for {model.label}">
            <GearIcon class="size-5" />
        </a>
        <Popover
            buttonList={[
                {
                    label: "Update API Key",
                    onclick: () => {
                        updateApiKeyModalOpen = true;
                    },
                },
            ]}>
            <LockIcon class="size-5" />
        </Popover>
    </div>
{/snippet}

{#snippet badges()}
    <Badge variant="primary">{modelProviderLabel(model.provider)}</Badge>
    <Badge variant="neutral">{model.name}</Badge>
    <span title={model.baseUrl}>
        <Badge variant="neutral">{truncateUrl(model.baseUrl)}</Badge>
    </span>
{/snippet}

<ResourceCard {header} {badges} />

<Modal bind:open={updateApiKeyModalOpen}>
    <PatchSecret
        label="Update API key"
        placeholder="sk-..."
        patchEndpoint={`/model/${model.id}/api-key`}
        onSuccess={() => {
            updateApiKeyModalOpen = false;
        }} />
</Modal>
