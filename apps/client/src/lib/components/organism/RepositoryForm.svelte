<script lang="ts">
    import InputText from "../atom/InputText.svelte";
    import fetchApi from "$lib/utils";
    import type {
        ModelProviderModelListResponse,
        ModelProviderResponse,
        ProviderOption,
        PrReviewOnPush,
        RepositoryInsert,
        RepositorySelectItem,
        RepositoryUpdateInput,
    } from "@proval/types";
    import FormField from "../molecule/FormField.svelte";
    import SimpleSelectCard from "../atom/SimpleSelectCard.svelte";
    import Select from "../atom/Select.svelte";
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
        prEnabled: boolean;
        prMinAccessLevel: number;
        prReviewEnabled: boolean;
        prInlineReview: boolean;
        prReviewOnPush: PrReviewOnPush;
        prIgnoreDraft: boolean;
        prReplyEnabled: boolean;
        prMentionOnly: boolean;
        issueEnabled: boolean;
        issueMinAccessLevel: number;
        issueCommentOnOpenEnabled: boolean;
        issueReplyEnabled: boolean;
        issueMentionOnly: boolean;
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
        onBack?: () => void;
    }

    interface ReviewPushOption {
        value: PrReviewOnPush;
        label: string;
        description: string;
    }

    interface AccessLevelOption {
        value: string;
        label: string;
        description: string;
    }

    const {
        modelList,
        provider,
        repositoryList,
        editRepositoryId,
        config,
        onSubmit,
        onDelete,
        onCancel,
        onBack,
    }: Props = $props();

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

    function formAccessLevel(level: number): string {
        if (level === 2) return "1";
        return String(level);
    }

    // Pull Request Configuration
    let prEnabled = $state<boolean>(config.prEnabled);
    let prMinAccessLevel = $state<string>(formAccessLevel(config.prMinAccessLevel));
    let prReviewEnabled = $state<boolean>(config.prReviewEnabled);
    let prInlineReview = $state<boolean>(config.prInlineReview);
    let prReviewOnPush = $state<PrReviewOnPush>(config.prReviewOnPush);
    let prIgnoreDraft = $state<boolean>(config.prIgnoreDraft);
    let prReplyEnabled = $state<boolean>(config.prReplyEnabled);
    let prMentionOnly = $state<boolean>(config.prMentionOnly);

    // Issue Configuration
    let issueEnabled = $state<boolean>(config.issueEnabled);
    let issueMinAccessLevel = $state<string>(formAccessLevel(config.issueMinAccessLevel));
    let issueCommentOnOpenEnabled = $state<boolean>(config.issueCommentOnOpenEnabled);
    let issueReplyEnabled = $state<boolean>(config.issueReplyEnabled);
    let issueMentionOnly = $state<boolean>(config.issueMentionOnly);

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
        "h-10 w-full rounded-lg border border-neutral-200 bg-neutral-50 px-4 text-sm outline-none disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-800";

    const reviewPushOptionList: ReviewPushOption[] = [
        {
            value: "on_first_push",
            label: "First push only",
            description: "Review once when the first meaningful push or ready transition arrives",
        },
        {
            value: "on_every_push",
            label: "Every push",
            description: "Review on each push",
        },
    ];

    const accessLevelOptionList: AccessLevelOption[] = [
        {
            value: "0",
            label: "Anyone",
            description: "Anyone who can see this repository can trigger the bot. Public repos can raise model cost.",
        },
        {
            value: "1",
            label: "Reader",
            description: "People who can read the repository, and everyone above.",
        },
        {
            value: "3",
            label: "Developer",
            description: "People who can push code, and everyone above.",
        },
        {
            value: "4",
            label: "Maintainer",
            description: "People who can manage repository settings, and everyone above.",
        },
        {
            value: "5",
            label: "Owner",
            description: "Owners and admins only.",
        },
    ];

    const repositorySelectOptionList = $derived(
        repositoryList.map((r) => ({
            value: r.id.toString(),
            label: r.path,
            description: r.isConnected ? "Already connected" : undefined,
        })),
    );

    const modelProviderSelectOptionList = $derived(
        modelList.map((mp) => ({
            value: mp.id.toString(),
            label: mp.label,
        })),
    );

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

        if (!editRepositoryId) {
            if (provider.type === "gitlab" || provider.type === "forgejo") {
                if (!webhookSecret?.trim()) {
                    await openAlert("Webhook secret is required");
                    return;
                }
            }
            if (isRepositoryConnected) {
                await openAlert("This repository is already connected to Proval");
                return;
            }
        }

        const body: RepositoryUpdateInput | RepositoryInsert = {
            path,
            description: description.trim() || null,
            provider: provider.type,
            language,
            modelProviderId: Number(selectedModelProviderId),
            modelName: modelName.trim(),
            prEnabled,
            prMinAccessLevel: Number(prMinAccessLevel),
            prReviewEnabled,
            prInlineReview,
            prReviewOnPush,
            prIgnoreDraft,
            prReplyEnabled,
            prMentionOnly,
            issueEnabled,
            issueMinAccessLevel: Number(issueMinAccessLevel),
            issueCommentOnOpenEnabled,
            issueReplyEnabled,
            issueMentionOnly,
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

        let confirmMessage = editRepositoryId ? "Save changes to this repository?" : "Create this repository?";
        if (prMinAccessLevel === "0" || issueMinAccessLevel === "0") {
            confirmMessage += " Minimum access is Anyone. Anyone can trigger the bot and that can increase model cost.";
        }
        const confirm = await openConfirm(confirmMessage);
        if (!confirm) return;

        try {
            await onSubmit(body);
        } catch (error) {
            await openAlert(error instanceof Error ? error.message : "Failed to submit repository");
            return;
        }
    }

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
            <Select
                label="Repository"
                description="Select a repository from the list"
                bind:value={selectedRepositoryId}
                disabled={repositoryList.length === 0}
                placeholder={repositoryList.length === 0 ? "No repositories available" : "Select a repository"}
                options={repositorySelectOptionList} />
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
            <Select
                label="Model Provider"
                description="LLM connection for this repository"
                bind:value={selectedModelProviderId}
                placeholder="Select a model provider"
                options={modelProviderSelectOptionList} />
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

    <Card spaceY>
        <div class="flex items-center justify-between gap-2">
            <h3 class="text-base font-medium text-neutral-800 dark:text-white">Pull request</h3>
            <ToggleSwitch bind:checked={prEnabled} />
        </div>
        <div class="space-y-6 {!prEnabled ? 'pointer-events-none opacity-40' : ''}">
            <div class="space-y-4">
                <div class="flex items-center justify-between gap-2">
                    <FieldTitle class="ml-1">Review</FieldTitle>
                    <ToggleSwitch bind:checked={prReviewEnabled} disabled={!prEnabled} />
                </div>
                <div class="space-y-4 {!prReviewEnabled ? 'pointer-events-none opacity-40' : ''}">
                    <FormField
                        label="Review on pull request push"
                        description="When Proval starts a pull request review"
                        linkLabelToControl={false}
                        upper>
                        {#snippet children({ id: _id })}
                            <div class="flex flex-col gap-2" id={_id} role="group">
                                {#each reviewPushOptionList as o}
                                    <SimpleSelectCard
                                        label={o.label}
                                        description={o.description}
                                        selected={prReviewOnPush === o.value}
                                        onclick={() => (prReviewOnPush = o.value)} />
                                {/each}
                            </div>
                        {/snippet}
                    </FormField>
                    <div class="flex items-center justify-between gap-2">
                        <FieldTitle class="ml-1">Inline review</FieldTitle>
                        <ToggleSwitch bind:checked={prInlineReview} disabled={!prEnabled || !prReviewEnabled} />
                    </div>
                    <div class="flex items-center justify-between gap-2">
                        <FieldTitle class="ml-1">Ignore draft pull requests</FieldTitle>
                        <ToggleSwitch bind:checked={prIgnoreDraft} disabled={!prEnabled || !prReviewEnabled} />
                    </div>
                </div>
            </div>

            <div class="space-y-4">
                <div class="flex items-center justify-between gap-2">
                    <FieldTitle class="ml-1">Reply</FieldTitle>
                    <ToggleSwitch bind:checked={prReplyEnabled} disabled={!prEnabled} />
                </div>
                <div class="space-y-4 {!prReplyEnabled ? 'pointer-events-none opacity-40' : ''}">
                    <div class="flex items-center justify-between gap-2">
                        <div>
                            <FieldTitle class="ml-1">Mentioned only</FieldTitle>
                            <Description class="ml-1"
                                >Non-members can trigger the bot by mentioning @Proval.</Description>
                        </div>
                        <ToggleSwitch bind:checked={prMentionOnly} disabled={!prEnabled || !prReplyEnabled} />
                    </div>
                </div>
            </div>

            <Select
                label="Minimum access"
                description="Lowest repository role that can trigger pull request review and reply"
                upper
                bind:value={prMinAccessLevel}
                options={accessLevelOptionList} />
        </div>
    </Card>
    <Card spaceY>
        <div class="flex items-center justify-between gap-2">
            <h3 class="text-base font-medium text-neutral-800 dark:text-white">Issue</h3>
            <ToggleSwitch bind:checked={issueEnabled} />
        </div>
        <div class="space-y-6 {!issueEnabled ? 'pointer-events-none opacity-40' : ''}">
            <div class="flex items-center justify-between gap-2">
                <FieldTitle class="ml-1">Comment when issue opens</FieldTitle>
                <ToggleSwitch bind:checked={issueCommentOnOpenEnabled} disabled={!issueEnabled} />
            </div>
            <div class="space-y-4">
                <div class="flex items-center justify-between gap-2">
                    <FieldTitle class="ml-1">Reply</FieldTitle>
                    <ToggleSwitch bind:checked={issueReplyEnabled} disabled={!issueEnabled} />
                </div>
                <div class="space-y-4 {!issueReplyEnabled ? 'pointer-events-none opacity-40' : ''}">
                    <div class="flex items-center justify-between gap-2">
                        <div>
                            <FieldTitle class="ml-1">Mentioned only</FieldTitle>
                            <Description class="ml-1"
                                >Non-members can trigger the bot by mentioning @Proval.</Description>
                        </div>
                        <ToggleSwitch bind:checked={issueMentionOnly} disabled={!issueEnabled || !issueReplyEnabled} />
                    </div>
                </div>
            </div>
            <Select
                label="Minimum access"
                description="Lowest repository role that can trigger issue comments and replies"
                upper
                bind:value={issueMinAccessLevel}
                options={accessLevelOptionList} />
        </div>
    </Card>

    <div class="flex justify-between gap-3 pt-2">
        <div class="flex gap-3">
            <Button primary type="submit">{editRepositoryId ? "Save" : "Create"}</Button>
            {#if onBack}
                <Button text type="button" onclick={onBack}>Back</Button>
            {/if}
        </div>
        <div>
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
