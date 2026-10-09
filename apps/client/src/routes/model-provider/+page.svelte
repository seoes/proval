<script lang="ts">
    import ResourceCard from "$lib/components/molecule/ResourceCard.svelte";
    import Badge from "$lib/components/atom/Badge.svelte";
    import Button from "$lib/components/atom/Button.svelte";
    import Modal from "$lib/components/atom/Modal.svelte";
    import { KeyIcon, PlusIcon } from "phosphor-svelte";
    import { modelProviderLabel, truncateUrl } from "$lib/utils/label";
    import type { PageProps } from "./$types";
    import DefaultLayout from "$lib/components/layout/DefaultLayout.svelte";

    const { data }: PageProps = $props();

    let addModelProviderModalOpen = $state(false);
</script>

{#snippet addModelProviderAction()}
    <Button
        onclick={() => (addModelProviderModalOpen = true)}
        size="sm"
        class="gap-1.5 text-foreground hover:text-foreground/70">
        <PlusIcon class="size-4" />
        Add Model Provider
    </Button>
{/snippet}

<DefaultLayout title="Model Provider" actions={addModelProviderAction}>
    {#if data.modelProviderList.length === 0}
        <div class="rounded-lg border border-border bg-card px-6 py-14 text-center">
            <p class="text-sm text-muted-foreground">No model providers connected yet.</p>
            <Button primary onclick={() => (addModelProviderModalOpen = true)} size="sm" class="mt-4 gap-1.5">
                <PlusIcon class="size-4" />
                Add your first model provider
            </Button>
        </div>
    {:else}
        <div class="space-y-3">
            {#each data.modelProviderList as modelProvider (modelProvider.id)}
                {#snippet header()}
                    <div class="ml-1.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                        <span class="truncate text-sm text-foreground">{modelProvider.label}</span>
                    </div>
                {/snippet}
                {#snippet badge()}
                    <Badge variant="primary"
                        >{modelProvider.authMethod === "xai_oauth"
                            ? "xAI OAuth"
                            : modelProviderLabel(modelProvider.provider)}</Badge>
                    {#if modelProvider.authMethod === "xai_oauth"}
                        <Badge variant="neutral"
                            >{modelProvider.oauthStatus === "reauthorization_required"
                                ? "Reconnect required"
                                : "Authorized"}</Badge>
                    {/if}
                    <Badge variant="neutral">{truncateUrl(modelProvider.baseUrl)}</Badge>
                {/snippet}
                <ResourceCard href="/model-provider/{modelProvider.id}" {header} {badge} />
            {/each}
        </div>
    {/if}
</DefaultLayout>

<Modal bind:open={addModelProviderModalOpen}>
    <div class="space-y-4">
        <h2 class="text-lg font-semibold">Add Model Provider</h2>
        <p class="text-sm text-muted-foreground">Choose how to connect your model provider.</p>
        <div class="space-y-2">
            <Button secondary href="/model-provider/create/api-key" class="w-full justify-start gap-2">
                <KeyIcon class="size-4 shrink-0" aria-hidden="true" />
                API Key
            </Button>
            <Button secondary href="/model-provider/create/xai-oauth" class="w-full justify-start gap-2">
                <svg class="size-4 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path
                        d="M6.469 8.776L16.512 23h-4.464L2.005 8.776H6.47zm-.004 7.9l2.233 3.164L6.467 23H2l4.465-6.324zM22 2.582V23h-3.659V7.764L22 2.582zM22 1l-9.952 14.095-2.233-3.163L17.533 1H22z" />
                </svg>
                xAI OAuth
            </Button>
        </div>
        <div class="flex justify-end">
            <Button text onclick={() => (addModelProviderModalOpen = false)}>Cancel</Button>
        </div>
    </div>
</Modal>
