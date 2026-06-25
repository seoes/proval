<script lang="ts">
    import InputText from "../atom/InputText.svelte";
    import fetchApi from "$lib/utils";
    import type {
        ModelProviderModelListResponse,
        ModelProviderResponse,
        ProviderOption,
        ReplyThreadPolicy,
        RepositoryInsert,
        RepositorySelectItem,
        RepositoryUpdateInput,
    } from "@proval/types";
    import FormField from "../molecule/FormField.svelte";
    import SimpleSelectCard from "../atom/SimpleSelectCard.svelte";
    import PatchSecret from "../molecule/PatchSecret.svelte";
    import GitProviderIcon from "../atom/GitProviderIcon.svelte";
    import Card from "../layout/Card.svelte";
    import Button from "../atom/Button.svelte";
    import Modal from "../atom/Modal.svelte";
    import { openAlert, openConfirm } from "$lib/store/modal";
    import Description from "../atom/Description.svelte";
    import ToggleSwitch from "../atom/ToggleSwitch.svelte";
    import FieldTitle from "../atom/FieldTitle.svelte";

    interface Config {
        modelProviderId: number | null;
        modelName: string | null;
        repositoryId: number | null; // repository id from github/gitlab/forgejo for selection

        description: string | null;
        language: string | null;
        reviewOnPullRequestOpen: boolean;
        inlineReview: boolean;
        deepResearchOnPullRequest: boolean;
        replyToPullRequestComment: ReplyThreadPolicy;
        replyToIssueComment: ReplyThreadPolicy;
        commentOnIssueOpen: boolean;
    }

    interface Props {
        editRepositoryId: number | null; // repository id in the database for editing

        modelList: ModelProviderResponse[];
        repositoryList: RepositorySelectItem[];

        provider: ProviderOption;
        config: Config;
        onSubmit: (data: Record<string, unknown>) => Promise<void>;
        onDelete?: (repositoryId: number) => Promise<void>;
        onCancel: () => void;
    }

    interface CommentOption {
        value: ReplyThreadPolicy;
        description: string;
    }

    const { modelList, provider, repositoryList, editRepositoryId, config, onSubmit, onDelete, onCancel }: Props =
        $props();

    let selectedModelProviderId = $state<string>(String(config.modelProviderId ?? ""));
    let modelName = $state<string>(config.modelName ?? "");
    let availableModels = $state<{ id: string }[]>([]);
    let isLoadingModels = $state(false);
    let selectedRepositoryId = $state<string>(String(config.repositoryId ?? ""));

    let previousModelProviderId = $state(selectedModelProviderId);

    $effect(() => {
        if (selectedModelProviderId !== previousModelProviderId) {
            if (previousModelProviderId !== "") {
                modelName = "";
            }
            previousModelProviderId = selectedModelProviderId;
        }

        if (!selectedModelProviderId) {
            availableModels = [];
            return;
        }

        void (async () => {
            isLoadingModels = true;
            try {
                const res = await fetchApi(`/model-provider/${selectedModelProviderId}/model`);
                if (res.ok) {
                    const body = (await res.json()) as ModelProviderModelListResponse;
                    availableModels = body.models;
                } else {
                    availableModels = [];
                }
            } catch {
                availableModels = [];
            } finally {
                isLoadingModels = false;
            }
        })();
    });

    const path = $derived(
        selectedRepositoryId ? repositoryList.find((r) => r.id === Number(selectedRepositoryId))?.path : null,
    );
    const isRepositoryConnected = $derived(
        selectedRepositoryId ? repositoryList.find((r) => r.id === Number(selectedRepositoryId))?.isConnected : false,
    );

    let description = $state<string>(config.description ?? "");
    let language = $state<string>(config.language ?? "English");

    // Pull Request Configuration
    let reviewOnPullRequestOpen = $state<boolean>(config.reviewOnPullRequestOpen);
    let inlineReview = $state<boolean>(config.inlineReview);
    let deepResearchOnPullRequest = $state<boolean>(config.deepResearchOnPullRequest);
    let replyToPullRequestComment = $state<ReplyThreadPolicy>(config.replyToPullRequestComment);

    // Issue Configuration
    let commentOnIssueOpen = $state<boolean>(config.commentOnIssueOpen);
    let replyToIssueComment = $state<ReplyThreadPolicy>(config.replyToIssueComment);

    let webhookSecret = $state<string | null>(editRepositoryId ? null : "");
    let webhookSecretModalOpen = $state(false);
    let modelListModalOpen = $state(false);
    let modelNameDraft = $state("");

    function openModelModal() {
        if (!selectedModelProviderId) return;
        modelNameDraft = modelName;
        modelListModalOpen = true;
    }

    function confirmModelSelection() {
        const trimmed = modelNameDraft.trim();
        if (!trimmed) return;
        modelName = trimmed;
        modelListModalOpen = false;
    }

    function selectModelFromList(id: string) {
        modelName = id;
        modelListModalOpen = false;
    }

    const filteredAvailableModels = $derived.by(() => {
        const query = modelNameDraft.trim().toLowerCase();
        if (!query) return availableModels;
        return availableModels.filter((m) => m.id.toLowerCase().includes(query));
    });

    const selectClass =
        "h-10 w-full rounded-xl border border-neutral-200 bg-gray-50 px-4 text-sm outline-none disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-800";

    const commentOptionList: CommentOption[] = [
        { value: "all", description: "Reply on all thread comments" },
        { value: "mentioned_only", description: "Reply only when the bot is @mentioned" },
        { value: "off", description: "Do not reply to thread comments" },
    ];

    async function handleSubmit(e: Event) {
        e.preventDefault();

        if (!selectedModelProviderId) {
            await openAlert("Model provider is required");
            return;
        }
        if (!modelName.trim()) {
            await openAlert("Model is required");
            return;
        }
        if (!language.trim()) {
            await openAlert("Language is required");
            return;
        }
        if (!selectedRepositoryId || !path) {
            await openAlert("Repository is required");
            return;
        }

        if (isRepositoryConnected) {
            await openAlert("This repository is already connected to Proval");
            return;
        }

        if (!editRepositoryId) {
            if (provider.type === "gitlab" || provider.type === "forgejo") {
                if (!webhookSecret?.trim()) {
                    await openAlert("Webhook secret is required");
                    return;
                }
            }
        }

        const body: RepositoryUpdateInput | RepositoryInsert = {
            path,
            description: description.trim() || null,
            provider: provider.type,
            language,
            modelProviderId: Number(selectedModelProviderId),
            modelName: modelName.trim(),
            reviewOnPullRequestOpen,
            inlineReview,
            deepResearchOnPullRequest,
            replyToPullRequestComment,
            replyToIssueComment,
            commentOnIssueOpen,
        };

        if (provider.type === "gitlab" || provider.type === "forgejo") {
            body.gitProviderAccessId = provider.accessId;
            if (!editRepositoryId) {
                // new repository
                const trimmedSecret = webhookSecret?.trim();
                if (trimmedSecret) (body as RepositoryInsert).webhookSecret = trimmedSecret;
                body.gitProviderRepositoryId = Number(selectedRepositoryId);
            } else if (config.repositoryId !== Number(selectedRepositoryId)) {
                // update repository
                body.gitProviderRepositoryId = Number(selectedRepositoryId);
            }
        } else if (provider.type === "github") {
            body.githubInstallationId = provider.githubInstallationId;
            body.githubRepositoryId = Number(selectedRepositoryId);
        }

        const confirm = await openConfirm(
            editRepositoryId ? "Save changes to this repository?" : "Create this repository?",
        );
        if (!confirm) return;

        try {
            await onSubmit(body);
        } catch (error) {
            await openAlert(error instanceof Error ? error.message : "Failed to submit repository");
            return;
        }
    }

    const removeUnderscore = (value: string) => value.replace(/_/g, " ");
    const capitalizeFirstLetter = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);
</script>

<form onsubmit={handleSubmit} class="space-y-8">
    <Card spaceY>
        <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
                <GitProviderIcon provider={provider.type} boxed />
                <div class="min-w-0 flex-1">
                    {#if provider.type === "gitlab" || provider.type === "forgejo"}
                        <FieldTitle>{provider.label}</FieldTitle>
                        <Description>{provider.baseUrl}</Description>
                    {:else if provider.type === "github"}
                        <FieldTitle>{provider.label}</FieldTitle>
                        <Description>{capitalizeFirstLetter(provider.type)}</Description>
                    {/if}
                </div>
            </div>
            <div class="flex items-center justify-between gap-2">
                <p class="truncate text-sm text-neutral-800 dark:text-neutral-200">
                    {path ?? "—"}
                </p>
            </div>
        </div>

        {#if editRepositoryId}
            <FormField label="Repository" description="Select a repository from the list">
                {#snippet children({ id })}
                    <select
                        {id}
                        bind:value={selectedRepositoryId}
                        disabled={repositoryList.length === 0}
                        class={selectClass}>
                        <option value="">
                            {repositoryList.length === 0 ? "No repositories available" : "Select a repository"}
                        </option>
                        {#each repositoryList as r}
                            <option value={r.id.toString()}>
                                {r.path}{r.isConnected ? " (connected)" : ""}
                            </option>
                        {/each}
                    </select>
                {/snippet}
            </FormField>
        {/if}

        {#if provider.type === "gitlab" || provider.type === "forgejo"}
            {#if editRepositoryId}
                <div class="flex justify-end pt-2">
                    <Button text onclick={() => (webhookSecretModalOpen = true)} type="button" class="w-auto text-xs">
                        Update Webhook Secret
                    </Button>
                </div>
            {:else}
                <FormField
                    label="Webhook secret"
                    description="Must match the Secret Token in your GitLab or Forgejo webhook settings">
                    {#snippet children({ id })}
                        <InputText {id} password placeholder="secret" bind:value={webhookSecret as string} required />
                    {/snippet}
                </FormField>
            {/if}
        {/if}
    </Card>
    <Card title="Review Agent" spaceY>
        <FormField label="Description" description="Optional note for your team (not shown on the Git host)">
            {#snippet children({ id })}
                <InputText {id} placeholder="e.g. Backend API" bind:value={description} />
            {/snippet}
        </FormField>
        <div>
            <FormField label="Model Provider" description="LLM connection for this repository">
                {#snippet children({ id })}
                    <select {id} bind:value={selectedModelProviderId} class={selectClass}>
                        <option value="">Select a model provider</option>
                        {#each modelList as mp}
                            <option value={mp.id.toString()}>{mp.label}</option>
                        {/each}
                    </select>
                {/snippet}
            </FormField>
        </div>
        <div>
            <FormField
                label="Model"
                description="Model ID sent to the API. Click to type or choose from the provider list.">
                {#snippet children({ id })}
                    <button
                        type="button"
                        {id}
                        disabled={!selectedModelProviderId}
                        onclick={openModelModal}
                        class="{selectClass} text-left {selectedModelProviderId ? 'cursor-pointer' : ''} {modelName
                            ? 'text-neutral-900 dark:text-neutral-100'
                            : 'text-neutral-400 dark:text-neutral-500'}">
                        {modelName || "anthropic/claude-sonnet-4.6"}
                    </button>
                {/snippet}
            </FormField>
        </div>
        <div>
            <FormField label="Language" description="Default language for code review">
                {#snippet children({ id })}
                    <InputText {id} placeholder="English" bind:value={language} />
                {/snippet}
            </FormField>
        </div>
    </Card>

    <Card title="Pull request" spaceY>
        <div class="space-y-4">
            <div class="flex items-center justify-between gap-2">
                <FieldTitle>Review when PR opens</FieldTitle>
                <ToggleSwitch bind:checked={reviewOnPullRequestOpen} />
            </div>
            <div class="flex items-center justify-between">
                <FieldTitle>Inline review</FieldTitle>
                <ToggleSwitch bind:checked={inlineReview} />
            </div>
            <div class="flex items-center justify-between">
                <div>
                    <FieldTitle>Deep Research</FieldTitle>
                    <Description>Sub agents will be used to analyze the code</Description>
                </div>
                <ToggleSwitch bind:checked={deepResearchOnPullRequest} />
            </div>
        </div>
        <div>
            <FormField
                label="Reply to comments"
                description="How the bot responds in PR discussion threads"
                linkLabelToControl={false}
                upper>
                {#snippet children({ id: _id })}
                    <div class="flex flex-col gap-2" id={_id} role="group">
                        {#each commentOptionList as o}
                            <SimpleSelectCard
                                label={removeUnderscore(capitalizeFirstLetter(o.value))}
                                description={o.description}
                                selected={replyToPullRequestComment === o.value}
                                onclick={() => (replyToPullRequestComment = o.value)} />
                        {/each}
                    </div>
                {/snippet}
            </FormField>
        </div>
    </Card>
    <Card title="Issue" spaceY>
        <div class="flex items-center justify-between gap-2">
            <FieldTitle>Comment when issue opens</FieldTitle>
            <ToggleSwitch bind:checked={commentOnIssueOpen} />
        </div>
        <div>
            <FormField
                label="Reply to issue comments"
                description="How the bot responds in issue discussion threads"
                linkLabelToControl={false}
                upper>
                {#snippet children({ id: _id })}
                    <div class="flex flex-col gap-2" id={_id} role="group">
                        {#each commentOptionList as o}
                            <SimpleSelectCard
                                label={removeUnderscore(capitalizeFirstLetter(o.value))}
                                description={o.description}
                                selected={replyToIssueComment === o.value}
                                onclick={() => (replyToIssueComment = o.value)} />
                        {/each}
                    </div>
                {/snippet}
            </FormField>
        </div>
    </Card>

    <div class="-mt-2 flex justify-between">
        <div class="flex gap-4">
            <Button primary type="submit">{editRepositoryId ? "Save" : "Create"}</Button>
        </div>
        <div class="mr-4">
            {#if editRepositoryId && onDelete}
                <Button text type="button" onclick={() => onDelete(editRepositoryId)}>Remove Repository</Button>
            {:else}
                <Button text onclick={onCancel} type="button">Cancel</Button>
            {/if}
        </div>
    </div>
</form>

{#if editRepositoryId && (provider.type === "gitlab" || provider.type === "forgejo")}
    <Modal bind:open={webhookSecretModalOpen}>
        <PatchSecret
            label="Update Webhook Secret"
            placeholder="secret"
            patchEndpoint={`/repository/${editRepositoryId}/webhook-secret`}
            onSuccess={() => (webhookSecretModalOpen = false)} />
    </Modal>
{/if}

<Modal bind:open={modelListModalOpen} class="max-w-lg">
    <div class="space-y-4">
        <FieldTitle>Select model</FieldTitle>
        <Description>Type to filter the list, or enter a custom model ID.</Description>
        <InputText
            placeholder="anthropic/claude-sonnet-4.6"
            bind:value={modelNameDraft}
            onkeydown={(e) => {
                if (e.key === "Enter") {
                    e.preventDefault();
                    confirmModelSelection();
                }
            }} />
        {#if isLoadingModels}
            <Description>Loading models...</Description>
        {:else if availableModels.length > 0}
            <div class="h-72 overflow-y-auto rounded-xl border border-neutral-200 p-1 dark:border-neutral-700">
                {#if filteredAvailableModels.length === 0}
                    <div class="flex h-full items-center justify-center px-3">
                        <Description class="text-center">
                            No matching models. Confirm to use your custom model ID.
                        </Description>
                    </div>
                {:else}
                    <ul class="space-y-1">
                        {#each filteredAvailableModels as m (m.id)}
                            <li>
                                <button
                                    type="button"
                                    class="w-full cursor-pointer rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-700 {modelNameDraft ===
                                    m.id
                                        ? 'bg-primary/10 text-neutral-900 dark:text-neutral-100'
                                        : 'text-neutral-800 dark:text-neutral-200'}"
                                    onclick={() => selectModelFromList(m.id)}>
                                    {m.id}
                                </button>
                            </li>
                        {/each}
                    </ul>
                {/if}
            </div>
        {:else}
            <Description>No models were returned by this provider.</Description>
        {/if}
        <div class="flex justify-end gap-3 pt-1">
            <Button text type="button" onclick={() => (modelListModalOpen = false)}>Cancel</Button>
            <Button primary type="button" onclick={confirmModelSelection}>Confirm</Button>
        </div>
    </div>
</Modal>
