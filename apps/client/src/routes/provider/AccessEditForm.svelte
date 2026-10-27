<script lang="ts">
    import Button from "$lib/components/atom/Button.svelte";
    import InputText from "$lib/components/atom/InputText.svelte";
    import InputCombobox from "$lib/components/atom/InputCombobox.svelte";
    import { repositoryLanguageList } from "$lib/repositoryLanguageList";
    import ToggleSwitch from "$lib/components/atom/ToggleSwitch.svelte";
    import Card from "$lib/components/layout/Card.svelte";
    import FormField from "$lib/components/molecule/FormField.svelte";
    import Select from "$lib/components/atom/Select.svelte";
    import Radio from "$lib/components/atom/Radio.svelte";
    import SimpleSelectCard from "$lib/components/atom/SimpleSelectCard.svelte";
    import FieldTitle from "$lib/components/atom/FieldTitle.svelte";
    import Description from "$lib/components/atom/Description.svelte";
    import fetchApi from "$lib/utils";
    import { openAlert } from "$lib/store/modal";
    import { goto } from "$app/navigation";
    import type {
        AccessResponse,
        AccessUpdateInput,
        ModelProviderModelListResponse,
        ModelProviderResponse,
        PrReviewOnClose,
        PrReviewOnPush,
    } from "@proval/types";

    const {
        item,
        modelList,
    }: {
        item: AccessResponse;
        modelList: ModelProviderResponse[];
    } = $props();

    const webhookPath = $derived(item.provider === "gitlab" ? "/webhook/gitlab" : "/webhook/forgejo");

    let formName = $state("");
    let formBaseUrl = $state("");
    let autoCreateEnabled = $state(false);
    let webhookSecret = $state("");
    let webhookSigningToken = $state("");
    let webhookTokenType = $state<"secret" | "signing">("secret");
    let selectedModelProviderId = $state("");
    let modelName = $state("");
    let language = $state("English");

    let prEnabled = $state(true);
    let prMinAccessLevel = $state("0");
    let prReviewEnabled = $state(true);
    let prInlineReview = $state(true);
    let prReviewOnPush = $state<PrReviewOnPush>("on_every_push");
    let prReviewOnClose = $state<PrReviewOnClose>("continue");
    let prIgnoreDraft = $state(true);
    let prReplyEnabled = $state(true);
    let prMentionOnly = $state(false);

    let issueEnabled = $state(true);
    let issueMinAccessLevel = $state("0");
    let issueCommentOnOpenEnabled = $state(true);
    let issueLabelOnOpenEnabled = $state(true);
    let issueReplyEnabled = $state(true);
    let issueMentionOnly = $state(false);

    let modelPickerOpen = $state(false);
    let modelNameDraft = $state("");
    let availableModels = $state<{ id: string }[]>([]);
    let isLoadingModels = $state(false);
    let isSaving = $state(false);

    const accessLevelOptionList = [
        { value: "0", label: "Anyone", description: "Anyone who can see this repository can trigger the bot." },
        { value: "1", label: "Reader", description: "People who can read the repository, and everyone above." },
        {
            value: "2",
            label: "Reviewer",
            description: "People who can manage issues and pull requests without write access, and everyone above.",
            hideOnForgejo: true,
        },
        { value: "3", label: "Developer", description: "People who can push code, and everyone above." },
        {
            value: "4",
            label: "Maintainer",
            description: "People who can manage repository settings, and everyone above.",
        },
        { value: "5", label: "Owner", description: "Owners and admins only." },
    ];

    const visibleAccessLevelOptionList = $derived(
        accessLevelOptionList.filter((option) => item.provider !== "forgejo" || !option.hideOnForgejo),
    );

    const reviewPushOptionList: { value: PrReviewOnPush; label: string; description: string }[] = [
        {
            value: "on_first_push",
            label: "First push only",
            description: "Review once when the first meaningful push or ready transition arrives",
        },
        { value: "on_every_push", label: "Every push", description: "Review on each push" },
    ];

    const reviewOnCloseOptionList: { value: PrReviewOnClose; label: string; description: string }[] = [
        { value: "continue", label: "Continue", description: "Finish and post the review" },
        {
            value: "continue_if_started",
            label: "Continue if already started",
            description: "If a review has started, finish every review for that pull request. Otherwise cancel reviews that are still waiting.",
        },
        { value: "cancel", label: "Cancel", description: "Cancel the review" },
    ];

    const modelProviderSelectOptionList = $derived(
        modelList.map((mp) => ({
            value: mp.id.toString(),
            label: mp.label,
        })),
    );

    const selectClass =
        "h-10 w-full rounded-lg border border-input bg-input-background px-4 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50";

    const canSubmit = $derived.by(() => {
        if (!formName.trim() || !formBaseUrl.trim()) {
            return false;
        }
        if (!autoCreateEnabled) {
            return true;
        }
        const useSigningToken = item.provider === "gitlab" && webhookTokenType === "signing";
        const hasCredential = useSigningToken
            ? webhookSigningToken.trim().length > 0 ||
              item.hasDefaultWebhookSigningToken ||
              item.hasDefaultWebhookSecret
            : webhookSecret.trim().length > 0 ||
              item.hasDefaultWebhookSecret ||
              (item.provider === "gitlab" && item.hasDefaultWebhookSigningToken);
        return hasCredential && selectedModelProviderId !== "" && modelName.trim() !== "" && language.trim() !== "";
    });

    $effect(() => {
        if (!autoCreateEnabled) {
            modelPickerOpen = false;
        }
    });

    $effect(() => {
        formName = item.name;
        formBaseUrl = item.baseUrl;
        autoCreateEnabled = item.autoCreateEnabled;
        webhookSecret = "";
        webhookSigningToken = "";
        webhookTokenType =
            item.provider === "gitlab" && item.hasDefaultWebhookSigningToken && !item.hasDefaultWebhookSecret
                ? "signing"
                : "secret";
        selectedModelProviderId = item.defaultModelProviderId != null ? String(item.defaultModelProviderId) : "";
        modelName = item.defaultModelName ?? "";
        language = item.defaultLanguage ?? "English";
        prEnabled = item.defaultPrEnabled ?? true;
        prMinAccessLevel = String(item.defaultPrMinAccessLevel ?? 0);
        prReviewEnabled = item.defaultPrReviewEnabled ?? true;
        prInlineReview = item.defaultPrInlineReview ?? true;
        prReviewOnPush = item.defaultPrReviewOnPush ?? "on_every_push";
        prReviewOnClose = item.defaultPrReviewOnClose ?? "continue";
        prIgnoreDraft = item.defaultPrIgnoreDraft ?? true;
        prReplyEnabled = item.defaultPrReplyEnabled ?? true;
        prMentionOnly = item.defaultPrMentionOnly ?? false;
        issueEnabled = item.defaultIssueEnabled ?? true;
        issueMinAccessLevel = String(item.defaultIssueMinAccessLevel ?? 0);
        issueCommentOnOpenEnabled = item.defaultIssueCommentOnOpenEnabled ?? true;
        issueLabelOnOpenEnabled = item.defaultIssueLabelOnOpenEnabled ?? true;
        issueReplyEnabled = item.defaultIssueReplyEnabled ?? true;
        issueMentionOnly = item.defaultIssueMentionOnly ?? false;
    });

    async function loadModelList() {
        const id = selectedModelProviderId;
        if (!id) {
            return;
        }
        isLoadingModels = true;
        try {
            const res = await fetchApi(`/model-provider/${id}/model`);
            availableModels = res.ok ? ((await res.json()) as ModelProviderModelListResponse).models : [];
        } catch {
            availableModels = [];
        } finally {
            isLoadingModels = false;
        }
    }

    async function toggleModelPicker() {
        if (!selectedModelProviderId) {
            return;
        }
        modelPickerOpen = !modelPickerOpen;
        if (modelPickerOpen) {
            modelNameDraft = modelName;
            await loadModelList();
        }
    }

    function selectModelFromList(id: string) {
        modelName = id;
        modelPickerOpen = false;
    }

    const filteredAvailableModels = $derived.by(() => {
        const query = modelNameDraft.trim().toLowerCase();
        if (!query) {
            return availableModels;
        }
        return availableModels.filter((m) => m.id.toLowerCase().includes(query));
    });

    async function handleSave() {
        if (!canSubmit) {
            return;
        }
        isSaving = true;
        try {
            const body: AccessUpdateInput = {
                name: formName.trim(),
                baseUrl: formBaseUrl.trim(),
                autoCreateEnabled,
            };
            if (autoCreateEnabled) {
                if (item.provider === "gitlab" && webhookTokenType === "signing") {
                    const token = webhookSigningToken.trim();
                    if (token) body.defaultWebhookSigningToken = token;
                } else {
                    const secretTrimmed = webhookSecret.trim();
                    if (secretTrimmed) body.defaultWebhookSecret = secretTrimmed;
                }
                body.defaultModelProviderId = Number(selectedModelProviderId);
                body.defaultModelName = modelName.trim();
                body.defaultLanguage = language.trim();
                body.defaultPrEnabled = prEnabled;
                body.defaultPrMinAccessLevel = Number(prMinAccessLevel);
                body.defaultPrReviewEnabled = prReviewEnabled;
                body.defaultPrInlineReview = prInlineReview;
                body.defaultPrReviewOnPush = prReviewOnPush;
                body.defaultPrReviewOnClose = prReviewOnClose;
                body.defaultPrIgnoreDraft = prIgnoreDraft;
                body.defaultPrReplyEnabled = prReplyEnabled;
                body.defaultPrMentionOnly = prMentionOnly;
                body.defaultIssueEnabled = issueEnabled;
                body.defaultIssueMinAccessLevel = Number(issueMinAccessLevel);
                body.defaultIssueCommentOnOpenEnabled = issueCommentOnOpenEnabled;
                body.defaultIssueLabelOnOpenEnabled = issueLabelOnOpenEnabled;
                body.defaultIssueReplyEnabled = issueReplyEnabled;
                body.defaultIssueMentionOnly = issueMentionOnly;
            }
            const res = await fetchApi(`/access/${item.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            if (!res.ok) {
                const errorBody = await res.json().catch(() => ({}));
                await openAlert(errorBody.error || "Failed to save connection");
                return;
            }
            await goto("/provider");
        } catch {
            await openAlert("Failed to save connection");
        } finally {
            isSaving = false;
        }
    }
</script>

<div class="space-y-6">
    <Card title="Connection" spaceY>
        <FormField label="Name" description="A friendly label for this connection">
            {#snippet children({ id })}
                <InputText {id} bind:value={formName} />
            {/snippet}
        </FormField>
        <FormField
            label="Base URL"
            description={item.provider === "gitlab"
                ? "Root URL of your GitLab instance"
                : "Root URL of your Forgejo instance"}>
            {#snippet children({ id })}
                <InputText {id} bind:value={formBaseUrl} />
            {/snippet}
        </FormField>
    </Card>

    <div class="flex items-center justify-between gap-3">
        <h3 class="text-lg font-semibold tracking-tight text-foreground">Automatic repository registration</h3>
        <ToggleSwitch bind:checked={autoCreateEnabled} />
    </div>

    {#if autoCreateEnabled}
        <Description>
            {item.provider === "gitlab"
                ? "Configure this webhook URL and a matching secret or signing token. Proval registers the project on the first merge request, issue, or comment when this connection token can access the project."
                : "Share this webhook URL and secret. Proval registers the repository on the first pull request, issue, or comment when the webhook is set and this connection token can access the repository."}
        </Description>
        <p class="font-mono text-xs text-secondary-foreground">
            http://&lt;your-server&gt;:7901{webhookPath}
        </p>

        <div class="space-y-6">
            <Card title="Default Config" spaceY>
                {#if item.provider === "gitlab"}
                    <FormField label="Webhook token type" linkLabelToControl={false}>
                        {#snippet children({ id })}
                            <div {id} class="mt-2 ml-1 flex flex-wrap gap-x-8 gap-y-3" role="radiogroup">
                                <Radio
                                    name="{id}-token"
                                    bind:group={webhookTokenType}
                                    value="secret"
                                    label="Secret token" />
                                <Radio
                                    name="{id}-token"
                                    bind:group={webhookTokenType}
                                    value="signing"
                                    label="Signing token" />
                            </div>
                        {/snippet}
                    </FormField>
                {/if}
                {#if item.provider === "gitlab" && webhookTokenType === "signing"}
                    <FormField
                        label="Signing token"
                        description="Paste the signing token generated in GitLab for the webhook used to register projects. Leave blank to keep the saved token.">
                        {#snippet children({ id })}
                            <InputText
                                {id}
                                password
                                placeholder={item.hasDefaultWebhookSigningToken
                                    ? "Leave blank to keep current token"
                                    : "whsec_..."}
                                bind:value={webhookSigningToken} />
                        {/snippet}
                    </FormField>
                {:else}
                    <FormField
                        label="Webhook secret"
                        description="Must match the secret in each project webhook. Leave blank to keep the saved secret.">
                        {#snippet children({ id })}
                            <InputText
                                {id}
                                password
                                placeholder={item.hasDefaultWebhookSecret
                                    ? "Leave blank to keep current secret"
                                    : "secret"}
                                bind:value={webhookSecret} />
                        {/snippet}
                    </FormField>
                {/if}
                <Select
                    label="Model Provider"
                    description="LLM connection for auto registered repositories"
                    bind:value={selectedModelProviderId}
                    placeholder="Select a model provider"
                    options={modelProviderSelectOptionList} />
                <FormField label="Model" description="Model ID sent to the API">
                    {#snippet children({ id })}
                        <button
                            type="button"
                            {id}
                            disabled={!selectedModelProviderId}
                            onclick={toggleModelPicker}
                            class="{selectClass} text-left {selectedModelProviderId ? 'cursor-pointer' : ''} {modelName
                                ? 'text-foreground'
                                : 'text-muted-foreground'}">
                            {modelName || "anthropic/claude-sonnet-4.6"}
                        </button>
                    {/snippet}
                </FormField>
                {#if modelPickerOpen}
                    <div class="space-y-3 rounded-xl border border-border p-4">
                        <InputText placeholder="anthropic/claude-sonnet-4.6" bind:value={modelNameDraft} />
                        {#if isLoadingModels}
                            <Description>Loading models...</Description>
                        {:else if filteredAvailableModels.length > 0}
                            <div class="max-h-72 overflow-y-auto rounded-lg border border-border p-1">
                                <ul class="space-y-1">
                                    {#each filteredAvailableModels as model (model.id)}
                                        <li>
                                            <button
                                                type="button"
                                                class="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-accent"
                                                onclick={() => selectModelFromList(model.id)}>
                                                {model.id}
                                            </button>
                                        </li>
                                    {/each}
                                </ul>
                            </div>
                        {/if}
                        <div class="flex justify-end gap-2">
                            <Button text type="button" onclick={() => (modelPickerOpen = false)}>Close</Button>
                            <Button
                                primary
                                type="button"
                                onclick={() => {
                                    const trimmed = modelNameDraft.trim();
                                    if (trimmed) {
                                        modelName = trimmed;
                                        modelPickerOpen = false;
                                    }
                                }}>Use custom ID</Button>
                        </div>
                    </div>
                {/if}
                <FormField label="Language" description="Default language for code review">
                    {#snippet children({ id })}
                        <InputCombobox {id} placeholder="English" bind:value={language} suggestionList={repositoryLanguageList} />
                    {/snippet}
                </FormField>
            </Card>

            <Card spaceY>
                <div class="flex items-center justify-between gap-2">
                    <h3 class="text-base font-medium text-foreground">Pull request</h3>
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
                                {#snippet children({ id: groupId })}
                                    <div class="flex flex-col gap-2" id={groupId} role="group">
                                        {#each reviewPushOptionList as option}
                                            <SimpleSelectCard
                                                label={option.label}
                                                description={option.description}
                                                selected={prReviewOnPush === option.value}
                                                onclick={() => (prReviewOnPush = option.value)} />
                                        {/each}
                                    </div>
                                {/snippet}
                            </FormField>
                            <FormField
                                label="When a pull request is merged or closed"
                                description="What happens to a review that is still running"
                                linkLabelToControl={false}
                                upper>
                                {#snippet children({ id: groupId })}
                                    <div class="flex flex-col gap-2" id={groupId} role="group">
                                        {#each reviewOnCloseOptionList as option}
                                            <SimpleSelectCard
                                                label={option.label}
                                                description={option.description}
                                                selected={prReviewOnClose === option.value}
                                                onclick={() => (prReviewOnClose = option.value)} />
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
                        <div
                            class="flex items-center justify-between gap-2 {!prReplyEnabled
                                ? 'pointer-events-none opacity-40'
                                : ''}">
                            <FieldTitle class="ml-1">Mentioned only</FieldTitle>
                            <ToggleSwitch bind:checked={prMentionOnly} disabled={!prEnabled || !prReplyEnabled} />
                        </div>
                    </div>
                    <Select
                        label="Minimum access"
                        description="Lowest repository role that can trigger pull request review and reply"
                        upper
                        bind:value={prMinAccessLevel}
                        options={visibleAccessLevelOptionList} />
                </div>
            </Card>

            <Card spaceY>
                <div class="flex items-center justify-between gap-2">
                    <h3 class="text-base font-medium text-foreground">Issue</h3>
                    <ToggleSwitch bind:checked={issueEnabled} />
                </div>
                <div class="space-y-6 {!issueEnabled ? 'pointer-events-none opacity-40' : ''}">
                    <div class="flex items-center justify-between gap-2">
                        <FieldTitle class="ml-1">Comment when issue opens</FieldTitle>
                        <ToggleSwitch bind:checked={issueCommentOnOpenEnabled} disabled={!issueEnabled} />
                    </div>
                    <div class="flex items-center justify-between gap-2">
                        <FieldTitle class="ml-1">Label when issue opens</FieldTitle>
                        <ToggleSwitch bind:checked={issueLabelOnOpenEnabled} disabled={!issueEnabled} />
                    </div>
                    <div class="space-y-4">
                        <div class="flex items-center justify-between gap-2">
                            <FieldTitle class="ml-1">Reply</FieldTitle>
                            <ToggleSwitch bind:checked={issueReplyEnabled} disabled={!issueEnabled} />
                        </div>
                        <div
                            class="flex items-center justify-between gap-2 {!issueReplyEnabled
                                ? 'pointer-events-none opacity-40'
                                : ''}">
                            <FieldTitle class="ml-1">Mentioned only</FieldTitle>
                            <ToggleSwitch
                                bind:checked={issueMentionOnly}
                                disabled={!issueEnabled || !issueReplyEnabled} />
                        </div>
                    </div>
                    <Select
                        label="Minimum access"
                        description="Lowest repository role that can trigger issue comments and replies"
                        upper
                        bind:value={issueMinAccessLevel}
                        options={visibleAccessLevelOptionList} />
                </div>
            </Card>
        </div>
    {/if}

    <div class="flex justify-between gap-3 pt-2">
        <Button text onclick={() => goto("/provider")} disabled={isSaving}>Cancel</Button>
        <Button primary onclick={handleSave} disabled={isSaving || !canSubmit}>
            {isSaving ? "Saving..." : "Save"}
        </Button>
    </div>
</div>
